import { apiClient } from "./apiClient";

export type ScaleMode = "WEIGHT" | "PRICE";
export interface ScaleSettings {
  enabled: boolean;
  /** "20,21,27" */
  prefixes: string;
  pluLength: number;
  mode: ScaleMode;
}

export const scaleSettingsService = {
  async get(companyId: number): Promise<ScaleSettings> {
    const res: any = await apiClient.get("/company/scale-settings", { params: { companyId } });
    return res?.data;
  },
  async update(companyId: number, data: Partial<ScaleSettings>): Promise<ScaleSettings> {
    const res: any = await apiClient.put("/company/scale-settings", { companyId, ...data });
    return res?.data;
  },
};
