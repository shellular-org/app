import { networkInterfaces, platform } from "node:os";

export default function getIp() {
  const nets = networkInterfaces();
  let ip = "";

  Object.keys(nets).some((name) =>
    nets[name].find((net) => {
      if (platform() === "win32" && name !== "Wi-Fi") return false;
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value && !net.internal) {
        ip = net.address;
        return ip;
      }
      return false;
    }),
  );

  return ip;
}
