import _ from "lodash";
import findUp from "find-up";
import fs from "fs";
const configPath = findUp.sync([".mntrbt", ".mntrbt.json"]);

export function getConfig() {
  return configPath ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
}

export function get(key: string): JSON {
  return _.get(getConfig(), key);
}

export async function write(key: string, value: any) {
  const config = getConfig();
  _.set(config, key, value);
  fs.writeFileSync(configPath, JSON.stringify(config));
}
