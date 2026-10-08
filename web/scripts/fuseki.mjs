import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const bundled = (prefix) =>
  existsSync(".tools")
    ? readdirSync(".tools").find(
        (n) => n.startsWith(prefix) && existsSync(join(".tools", n, "bin")),
      )
    : undefined;
const fuseki =
  process.env.FUSEKI_HOME ||
  join(
    root,
    ".tools",
    (existsSync(".tools")
      ? readdirSync(".tools", { withFileTypes: true })
      : []
    ).find((n) => n.isDirectory() && n.name.startsWith("apache-jena-fuseki-"))
      ?.name || "missing",
  );
const javaHome =
  process.env.JAVA_HOME ||
  (bundled("jdk-") ? join(root, ".tools", bundled("jdk-")) : undefined);
const java = javaHome
  ? join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java")
  : "java";
const jar = join(fuseki, "fuseki-server.jar");
if (!existsSync(jar)) {
  console.error(
    "Set FUSEKI_HOME to the extracted Apache Fuseki directory containing fuseki-server.jar. See README.md.",
  );
  process.exit(1);
}
const rdf = resolve(
  process.env.LEXNET_RDF_FILE || "../build/lexnet-full.ttl",
);
if (!existsSync(rdf)) {
  console.error(
    `RDF file not found: ${rdf}. Run from web/ and check ../build/lexnet-full.ttl or set LEXNET_RDF_FILE. See README.md.`,
  );
  process.exit(1);
}
mkdirSync(".runtime/fuseki", { recursive: true });
const child = spawn(
  java,
  [
    "-jar",
    jar,
    `--port=${process.env.FUSEKI_PORT || 3030}`,
    `--file=${rdf}`,
    "/lexnet",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FUSEKI_HOME: fuseki,
      FUSEKI_BASE: resolve(".runtime/fuseki"),
    },
  },
);
child.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
