import { companyService } from './companyService';
import { useSessionAuthStore } from '../stores/sessionAuthStore';

/** Full company profile for printed documents (logo, address, tax number); falls back to the session copy */
export async function loadCompanyProfile(): Promise<any> {
  const session = useSessionAuthStore.getState().company as any;
  const companyId = session?.companyId || session?.company?.id;
  try {
    if (companyId) return await companyService.getProfile(companyId);
  } catch {
    /* offline or no access: use the session copy */
  }
  return session?.company || session || {};
}
