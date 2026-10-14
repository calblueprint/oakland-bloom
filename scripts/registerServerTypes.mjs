// Development/test CLI loader only. Next.js enforces the real server-only marker
// in application builds. This never registers a browser-accessible endpoint.
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";

// Standalone Node has no Next.js build layer to resolve this marker.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }
    if (
      specifier === "../client" &&
      context.parentURL?.endsWith("getChefReservations.ts")
    ) {
      return nextResolve("../client.ts", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
