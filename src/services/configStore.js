// Storage manager for dev-app command shortcuts
const STORAGE_KEY = "dev_command_runner_config_v1";

export const DEFAULT_TASKS = [
  {
    id: "task-frontend-dev",
    title: "Vite Dev Server",
    cwd: ".",
    command: "npm run dev",
    autoScroll: true,
    tags: ["Frontend", "Vite"]
  },
  {
    id: "task-backend-express",
    title: "Express Backend Server",
    cwd: ".",
    command: "npm start",
    autoScroll: true,
    tags: ["Backend", "Node"]
  },
  {
    id: "task-docker-db",
    title: "Docker Compose Database",
    cwd: ".",
    command: "docker compose up -d",
    autoScroll: true,
    tags: ["Database", "Docker"]
  }
];

export async function loadTasksConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Failed to load config from storage, using defaults:", err);
  }
  return DEFAULT_TASKS;
}

export async function saveTasksConfig(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error("Failed to save tasks config:", err);
  }
}
