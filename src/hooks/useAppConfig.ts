import { useState, useEffect, useCallback } from "react";
import { isTauri, configAPI } from "../services/tauriBridge";

export interface AppConfig {
  backend: {
    apiUrl: string;
    timeout: number;
    retries: number;
  };
  hardware: {
    scanner: {
      mode: "hid" | "serial";
      comPort?: string;
      baudRate: number;
      debounceMs: number;
      prefix?: string;
      suffix?: string;
    };
    printer: {
      deviceId?: string;
      width: number;
      copies: number;
    };
  };
  ui: {
    theme: "light" | "dark" | "auto";
    language: "ar" | "en";
    fontSize: "small" | "medium" | "large";
  };
  debug: {
    enabled: boolean;
    logLevel: "error" | "warn" | "info" | "debug";
  };
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (isTauri) {
        const result = await configAPI.getConfig();
        if (result?.success && result.data) {
          setConfig(result.data);
        } else {
          setError(result?.error || "Failed to load config");
        }
      } else if ((window as any).configAPI) {
        const result = await (window as any).configAPI.getConfig();
        if (result?.success && result.data) {
          setConfig(result.data);
        }
      } else {
        setError("Configuration loading not available in web mode");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = useCallback(
    async (newConfig: Partial<AppConfig>) => {
      try {
        setError(null);
        const merged = { ...config, ...newConfig };
        if (isTauri) {
          const result = await configAPI.setConfig(merged);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        } else if ((window as any).configAPI) {
          const result = await (window as any).configAPI.setConfig(merged);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        }
        setError("Failed to update configuration");
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
        return false;
      }
    },
    [config, loadConfig]
  );

  const updateBackendUrl = useCallback(
    async (url: string) => {
      try {
        setError(null);
        if (isTauri) {
          const result = await configAPI.setBackendUrl(url);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        } else if ((window as any).configAPI) {
          const result = await (window as any).configAPI.setBackendUrl(url);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        }
        setError("Failed to update backend URL");
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
        return false;
      }
    },
    [loadConfig]
  );

  const testBackendConnection = useCallback(async (url?: string) => {
    try {
      if (isTauri) {
        const result = await configAPI.testBackend(url);
        return result;
      } else if ((window as any).configAPI) {
        return await (window as any).configAPI.testBackend(url);
      }
      return { success: false, error: "Not available in web mode" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Test failed" };
    }
  }, []);

  const resetConfig = useCallback(async () => {
    try {
      setError(null);
      if (isTauri) {
        const result = await configAPI.resetConfig();
        if (result?.success) {
          await loadConfig();
          return true;
        }
      } else if ((window as any).configAPI) {
        const result = await (window as any).configAPI.resetConfig();
        if (result?.success) {
          await loadConfig();
          return true;
        }
      }
      setError("Failed to reset configuration");
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      return false;
    }
  }, [loadConfig]);

  const exportConfig = useCallback(async () => {
    try {
      if (isTauri) {
        const result = await configAPI.exportConfig();
        return result?.data || null;
      } else if ((window as any).configAPI) {
        const result = await (window as any).configAPI.exportConfig();
        return result?.data || null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const importConfig = useCallback(
    async (configJson: string) => {
      try {
        setError(null);
        if (isTauri) {
          const result = await configAPI.importConfig(configJson);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        } else if ((window as any).configAPI) {
          const result = await (window as any).configAPI.importConfig(configJson);
          if (result?.success) {
            await loadConfig();
            return true;
          }
        }
        setError("Failed to import configuration");
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
        return false;
      }
    },
    [loadConfig]
  );

  return {
    config,
    loading,
    error,
    loadConfig,
    updateConfig,
    updateBackendUrl,
    testBackendConnection,
    resetConfig,
    exportConfig,
    importConfig,
  };
}
