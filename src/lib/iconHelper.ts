import * as Icons from "lucide-react";

export function getIconComponent(iconName: string) {
  return (Icons as Record<string, any>)[iconName] || Icons.Folder;
}
