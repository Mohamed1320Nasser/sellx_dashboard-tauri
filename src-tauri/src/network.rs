use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::time::{interval, Duration};

static IS_ONLINE: AtomicBool = AtomicBool::new(true);

async fn ping_hosts() -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    let urls = [
        "https://www.google.com",
        "https://1.1.1.1",
        "https://www.microsoft.com",
    ];

    for url in urls {
        if client.head(url).send().await.is_ok() {
            return true;
        }
    }
    false
}

pub fn start_network_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let online = ping_hosts().await;
        IS_ONLINE.store(online, Ordering::Relaxed);
        let _ = app.emit("network:status-changed", online);

        let mut ticker = interval(Duration::from_secs(5));
        loop {
            ticker.tick().await;
            let online = ping_hosts().await;
            let prev = IS_ONLINE.swap(online, Ordering::Relaxed);
            if prev != online {
                log::info!("[Network] Status changed: {}", if online { "online" } else { "offline" });
                let _ = app.emit("network:status-changed", online);
            }
        }
    });
}

#[tauri::command]
pub fn get_network_status() -> serde_json::Value {
    let online = IS_ONLINE.load(Ordering::Relaxed);
    serde_json::json!({ "success": true, "data": { "isOnline": online } })
}

#[tauri::command]
pub async fn check_network_now() -> serde_json::Value {
    let online = ping_hosts().await;
    IS_ONLINE.store(online, Ordering::Relaxed);
    serde_json::json!({ "success": true, "data": { "isOnline": online } })
}
