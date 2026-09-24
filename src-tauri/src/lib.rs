use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State, Window, Manager};
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

#[derive(Clone, serde::Serialize)]
struct LogPayload {
    task_id: String,
    line: String,
    is_error: bool,
}

#[derive(Clone, serde::Serialize)]
struct StatusPayload {
    task_id: String,
    status: String,
    code: Option<i32>,
}

type ProcessMap = Arc<Mutex<HashMap<String, u32>>>;

#[cfg(target_os = "windows")]
fn get_system_root() -> String {
    std::env::var("SystemRoot")
        .or_else(|_| std::env::var("WINDIR"))
        .unwrap_or_else(|_| "C:\\Windows".to_string())
}

#[cfg(target_os = "windows")]
fn get_comspec() -> String {
    if let Ok(comspec) = std::env::var("ComSpec") {
        if !comspec.trim().is_empty() && std::path::Path::new(&comspec).exists() {
            return comspec;
        }
    }
    let sys_root = get_system_root();
    let p = format!("{}\\System32\\cmd.exe", sys_root);
    if std::path::Path::new(&p).exists() {
        p
    } else {
        "cmd.exe".to_string()
    }
}

#[cfg(target_os = "windows")]
fn kill_process_tree_native(root_pid: u32) {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };

    let mut pids_to_kill = Vec::new();
    pids_to_kill.push(root_pid);

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot != INVALID_HANDLE_VALUE {
            let mut all_processes: Vec<(u32, u32)> = Vec::new();
            let mut entry: PROCESSENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32>() as u32;

            if Process32First(snapshot, &mut entry) != 0 {
                loop {
                    all_processes.push((entry.th32ProcessID, entry.th32ParentProcessID));
                    if Process32Next(snapshot, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snapshot);

            let mut i = 0;
            while i < pids_to_kill.len() {
                let current_parent = pids_to_kill[i];
                for &(pid, parent_pid) in &all_processes {
                    if parent_pid == current_parent && !pids_to_kill.contains(&pid) {
                        pids_to_kill.push(pid);
                    }
                }
                i += 1;
            }
        }

        for &pid in pids_to_kill.iter().rev() {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if handle != std::ptr::null_mut() && handle != INVALID_HANDLE_VALUE {
                let _ = TerminateProcess(handle, 1);
                CloseHandle(handle);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn get_augmented_path() -> String {
    let current_path = std::env::var("PATH").unwrap_or_default();
    let sys_root = get_system_root();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let app_data = std::env::var("APPDATA").unwrap_or_default();
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();

    let mut path_list: Vec<String> = current_path
        .split(';')
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    let critical_system_paths = [
        format!("{}\\System32", sys_root),
        format!("{}\\System32\\WindowsPowerShell\\v1.0", sys_root),
        format!("{}\\System32\\Wbem", sys_root),
        format!("{}\\SysWOW64", sys_root),
        sys_root.clone(),
    ];

    let common_dev_paths = [
        format!("{}\\npm", app_data),
        format!("{}\\Roaming\\npm", app_data),
        format!("{}\\Programs\\pnpm", local_app_data),
        format!("{}\\Yarn\\bin", local_app_data),
        format!("{}\\.bun\\bin", user_profile),
        format!("{}\\.cargo\\bin", user_profile),
        format!("{}\\scoop\\shims", user_profile),
        format!("{}\\AppData\\Local\\Programs\\fnm", user_profile),
        format!("{}\\AppData\\Roaming\\nvm", user_profile),
        "C:\\Program Files\\nodejs".to_string(),
        "C:\\Program Files (x86)\\nodejs".to_string(),
        "C:\\Program Files\\Git\\cmd".to_string(),
        "C:\\Program Files\\Git\\bin".to_string(),
        "C:\\Program Files\\Docker\\Docker\\resources\\bin".to_string(),
    ];

    for p in critical_system_paths.iter().chain(common_dev_paths.iter()) {
        if !p.is_empty() && std::path::Path::new(p).exists() {
            if !path_list.iter().any(|entry| entry.eq_ignore_ascii_case(p)) {
                path_list.push(p.clone());
            }
        }
    }

    path_list.join(";")
}

#[cfg(not(target_os = "windows"))]
fn get_augmented_path_unix() -> String {
    let current_path = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();

    let mut path_list: Vec<String> = current_path
        .split(':')
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
        .collect();

    let common_unix_paths = [
        "/usr/local/bin".to_string(),
        "/usr/local/sbin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        format!("{}/.cargo/bin", home),
        format!("{}/.bun/bin", home),
        format!("{}/.local/bin", home),
        format!("{}/.yarn/bin", home),
        format!("{}/.nvm/current/bin", home),
    ];

    for p in common_unix_paths.iter() {
        if !p.is_empty() && std::path::Path::new(p).exists() {
            if !path_list.iter().any(|entry| entry == p) {
                path_list.push(p.clone());
            }
        }
    }

    path_list.join(":")
}

#[tauri::command]
async fn spawn_shell_task(
    window: Window,
    process_map: State<'_, ProcessMap>,
    task_id: String,
    cwd: String,
    command: String,
) -> Result<(), String> {
    let task_id_clone = task_id.clone();
    let process_map_inner = process_map.inner().clone();

    // Kill existing process if running
    kill_task_by_id(&process_map_inner, &task_id_clone);

    tauri::async_runtime::spawn(async move {
        let _ = window.emit(
            "task-status",
            StatusPayload {
                task_id: task_id_clone.clone(),
                status: "RUNNING".to_string(),
                code: None,
            },
        );

        #[cfg(target_os = "windows")]
        let mut child_cmd = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let mut cmd = Command::new(get_comspec());
            cmd.arg("/D").arg("/C").raw_arg(&command);
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.env("PATH", get_augmented_path());
            cmd
        };

        #[cfg(not(target_os = "windows"))]
        let mut child_cmd = {
            let mut cmd = Command::new("sh");
            cmd.arg("-c").arg(&command);
            cmd.env("PATH", get_augmented_path_unix());
            cmd
        };

        child_cmd.stdout(Stdio::piped());
        child_cmd.stderr(Stdio::piped());

        let cwd_path = std::path::Path::new(&cwd);
        if cwd_path.is_dir() {
            child_cmd.current_dir(cwd_path);
        }

        let mut child = match child_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = window.emit(
                    "task-log",
                    LogPayload {
                        task_id: task_id_clone.clone(),
                        line: format!("[SYS-ERR] Failed to spawn process: {}", e),
                        is_error: true,
                    },
                );
                let _ = window.emit(
                    "task-status",
                    StatusPayload {
                        task_id: task_id_clone,
                        status: "FAILED".to_string(),
                        code: None,
                    },
                );
                return;
            }
        };


        let pid = child.id();
        {
            let mut map = process_map_inner.lock().unwrap();
            map.insert(task_id_clone.clone(), pid);
        }

        let _ = window.emit(
            "task-log",
            LogPayload {
                task_id: task_id_clone.clone(),
                line: format!("[SYS] Process spawned with PID {}", pid),
                is_error: false,
            },
        );

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let win = window.clone();
            let tid = task_id_clone.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        let _ = win.emit(
                            "task-log",
                            LogPayload {
                                task_id: tid.clone(),
                                line: l,
                                is_error: false,
                            },
                        );
                    }
                }
            });
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let win = window.clone();
            let tid = task_id_clone.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        let _ = win.emit(
                            "task-log",
                            LogPayload {
                                task_id: tid.clone(),
                                line: l,
                                is_error: true,
                            },
                        );
                    }
                }
            });
        }

        let exit_status = child.wait();
        let was_still_active = {
            let mut map = process_map_inner.lock().unwrap();
            map.remove(&task_id_clone).is_some()
        };

        let (status_str, code) = if !was_still_active {
            ("STOPPED".to_string(), None)
        } else {
            match exit_status {
                Ok(s) => {
                    if s.success() {
                        ("SUCCESS".to_string(), s.code())
                    } else {
                        ("FAILED".to_string(), s.code())
                    }
                }
                Err(_) => ("FAILED".to_string(), None),
            }
        };

        let _ = window.emit(
            "task-status",
            StatusPayload {
                task_id: task_id_clone,
                status: status_str,
                code,
            },
        );
    });

    Ok(())
}

#[tauri::command]
fn kill_shell_task(process_map: State<'_, ProcessMap>, task_id: String) -> Result<(), String> {
    let process_map_inner = process_map.inner().clone();
    kill_task_by_id(&process_map_inner, &task_id);
    Ok(())
}

#[tauri::command]
fn is_task_process_active(process_map: State<'_, ProcessMap>, task_id: String) -> bool {
    let map = process_map.inner().lock().unwrap();
    map.contains_key(&task_id)
}

#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(&url, None::<&str>).map_err(|e| format!("Failed to open URL: {}", e))
}

#[tauri::command]
fn exit_app() {
    std::process::exit(0);
}

fn kill_task_by_id(map_mutex: &Arc<Mutex<HashMap<String, u32>>>, task_id: &str) {
    let mut map = map_mutex.lock().unwrap();
    if let Some(pid) = map.remove(task_id) {
        #[cfg(target_os = "windows")]
        {
            kill_process_tree_native(pid);
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("kill")
                .args(&["-9", &pid.to_string()])
                .output();
        }
    }
}

pub fn run() {
    let process_map: ProcessMap = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .manage(process_map)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Retrieve default window icon if available
            let icon = app.default_window_icon().cloned();

            // Build the tray menu
            let show_i = MenuItemBuilder::with_id("show", "Show App").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show_i, &quit_i])
                .build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => {
                            let process_map = app.state::<ProcessMap>();
                            let pids: Vec<(String, u32)> = {
                                let map = process_map.lock().unwrap();
                                map.iter().map(|(k, v)| (k.clone(), *v)).collect()
                            };
                            for (_task_id, pid) in pids {
                                #[cfg(target_os = "windows")]
                                {
                                    kill_process_tree_native(pid);
                                }
                                #[cfg(not(target_os = "windows"))]
                                {
                                    let _ = Command::new("kill")
                                        .args(&["-9", &pid.to_string()])
                                        .output();
                                }
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click { 
                            button: MouseButton::Left, 
                            button_state: MouseButtonState::Up, 
                            .. 
                        } => {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        _ => {}
                    }
                });

            if let Some(i) = icon {
                tray_builder = tray_builder.icon(i);
            }

            let _tray = tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_shell_task,
            kill_shell_task,
            is_task_process_active,
            open_in_browser,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
