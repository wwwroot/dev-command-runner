use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State, Window};

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
        let (shell, args) = {
            let formatted_cmd = format!(
                "Set-Location -LiteralPath '{}'; {}",
                cwd.replace("'", "''"),
                command
            );
            ("powershell", vec!["-NoProfile".to_string(), "-ExecutionPolicy".to_string(), "Bypass".to_string(), "-Command".to_string(), formatted_cmd])
        };

        #[cfg(not(target_os = "windows"))]
        let (shell, args) = {
            let formatted_cmd = format!(
                "cd '{}' && {}",
                cwd.replace("'", "'\\''"),
                command
            );
            ("sh", vec!["-c".to_string(), formatted_cmd])
        };

        let mut child_cmd = Command::new(shell);
        child_cmd.args(&args);
        child_cmd.stdout(Stdio::piped());
        child_cmd.stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            child_cmd.creation_flags(CREATE_NO_WINDOW);
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
fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = Command::new("cmd")
            .args(&["/C", "start", "", &url])
            .spawn()
        {
            return Err(format!("Failed to open URL: {}", e));
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Err(e) = Command::new("open")
            .arg(&url)
            .spawn()
        {
            return Err(format!("Failed to open URL: {}", e));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Err(e) = Command::new("xdg-open")
            .arg(&url)
            .spawn()
        {
            return Err(format!("Failed to open URL: {}", e));
        }
    }
    Ok(())
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
            let _ = Command::new("taskkill")
                .args(&["/F", "/T", "/PID", &pid.to_string()])
                .output();
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
