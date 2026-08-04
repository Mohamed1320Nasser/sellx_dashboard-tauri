use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackendConfig {
    pub api_url: String,
    pub timeout: u64,
    pub retries: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub backend: BackendConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            backend: BackendConfig {
                api_url: "https://api.sellx.monasser.me".into(),
                timeout: 30000,
                retries: 3,
            },
        }
    }
}

const STORE_FILE: &str = "config.json";
const CONFIG_KEY: &str = "app_config";

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(CONFIG_KEY) {
        Some(val) => Ok(serde_json::json!({ "success": true, "data": val })),
        None => {
            let default = AppConfig::default();
            let val = serde_json::to_value(&default).map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "success": true, "data": val }))
        }
    }
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: serde_json::Value) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(CONFIG_KEY, config);
    store.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn get_backend_url(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let url = match store.get(CONFIG_KEY) {
        Some(val) => val
            .get("backend")
            .and_then(|b| b.get("apiUrl"))
            .and_then(|u| u.as_str())
            .unwrap_or("https://api.sellx.monasser.me")
            .to_string(),
        None => "https://api.sellx.monasser.me".to_string(),
    };
    Ok(serde_json::json!({ "success": true, "data": url }))
}

#[tauri::command]
pub async fn set_backend_url(app: AppHandle, url: String) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let mut config = match store.get(CONFIG_KEY) {
        Some(val) => val.clone(),
        None => serde_json::to_value(AppConfig::default()).map_err(|e| e.to_string())?,
    };
    if let Some(backend) = config.get_mut("backend") {
        backend["apiUrl"] = serde_json::Value::String(url);
    }
    store.set(CONFIG_KEY, config);
    store.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn test_backend(url: Option<String>) -> Result<serde_json::Value, String> {
    let test_url = url.unwrap_or_else(|| "https://api.sellx.monasser.me".into());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(format!("{}/health", test_url)).send().await {
        Ok(resp) if resp.status().is_success() => {
            Ok(serde_json::json!({ "success": true, "data": { "status": "connected", "url": test_url } }))
        }
        Ok(resp) => {
            Ok(serde_json::json!({ "success": false, "error": format!("Status {}", resp.status()) }))
        }
        Err(e) => {
            Ok(serde_json::json!({ "success": false, "error": format!("Connection failed: {}", e) }))
        }
    }
}

#[tauri::command]
pub async fn reset_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let val = serde_json::to_value(AppConfig::default()).map_err(|e| e.to_string())?;
    store.set(CONFIG_KEY, val);
    store.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn export_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let val = store.get(CONFIG_KEY).unwrap_or(serde_json::to_value(AppConfig::default()).unwrap());
    let json_str = serde_json::to_string_pretty(&val).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "data": json_str }))
}

#[tauri::command]
pub async fn import_config(app: AppHandle, config_json: String) -> Result<serde_json::Value, String> {
    let parsed: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(CONFIG_KEY, parsed);
    store.save().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}
