import React from "react";
import { Badge } from "../ui";
import { SalaryStatus } from "../../types";

interface SalaryStatusBadgeProps {
  status: SalaryStatus;
}

export const SalaryStatusBadge: React.FC<SalaryStatusBadgeProps> = ({ status }) => {
  const statusConfig = {
    [SalaryStatus.ACTIVE]: {
      label: "نشط",
      variant: "success" as const,
      color: "#10b981",
    },
    [SalaryStatus.INACTIVE]: {
      label: "غير نشط",
      variant: "error" as const,
      color: "#ef4444",
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} style={{ backgroundColor: config.color }}>
      {config.label}
    </Badge>
  );
};
