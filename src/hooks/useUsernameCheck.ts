import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/apiClient";

interface UseUsernameCheckResult {
  isChecking: boolean;
  isAvailable: boolean | null;
  error: string | null;
}

export const useUsernameCheck = (username: string, debounceMs: number = 500): UseUsernameCheckResult => {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset states if username is too short
    if (!username || username.trim().length < 3) {
      setIsAvailable(null);
      setError(null);
      setIsChecking(false);
      return;
    }

    // Debounce the API call
    const timer = setTimeout(async () => {
      setIsChecking(true);
      setError(null);

      try {
        const response = await apiClient.get<any>(
          `/user/check-username`,
          { params: { username: username.trim() } }
        );
        console.log('Username check full response:', response);
        // The response structure is { msg, status, data: { available: boolean }, error }
        const available = response.data?.available;
        console.log('Username check result:', { username: username.trim(), available });
        setIsAvailable(available);
      } catch (err) {
        console.error('Username check error:', err);
        setError("فشل التحقق من اسم المستخدم");
        setIsAvailable(null);
      } finally {
        setIsChecking(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [username, debounceMs]);

  return { isChecking, isAvailable, error };
};
