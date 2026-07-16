import { randomBytes } from "crypto";
export const code = (prefix: "REG" | "SUB") =>
  `${prefix}-2569-${randomBytes(4).toString("hex").toUpperCase()}`;
