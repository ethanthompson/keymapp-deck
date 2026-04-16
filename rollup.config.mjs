import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

/** @type {import('rollup').RollupOptions} */
export default {
  input: "src/plugin.ts",
  output: {
    file: "com.ethanthompson.keymapp-layers.sdPlugin/bin/plugin.js",
    format: "cjs",
    sourcemap: true,
    exports: "auto",
  },
  plugins: [
    typescript(),
    nodeResolve({ browser: false, exportConditions: ["node"] }),
    commonjs(),
  ],
  external: ["fs", "path", "child_process", "util", "os"],
};
