const { runMasterSync } = require("./modes/master");
const { runInventorySync } = require("./modes/inventory");
const { runSpecsSync } = require("./modes/specs");

const MODE = (process.env.JBI_MODE || "").trim().toLowerCase();

async function main() {
  console.log(`[jbi] starting in mode: ${MODE || "(none)"}`);
  switch (MODE) {
    case "master":
      return await runMasterSync();
    case "inventory":
      return await runInventorySync();
    case "specs":
      return await runSpecsSync();
    default:
      throw new Error(
        `JBI_MODE must be 'master', 'inventory', or 'specs' (got: '${MODE}')`,
      );
  }
}

main()
  .then((result) => {
    console.log(`[jbi] done:`, JSON.stringify(result || {}));
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[jbi] failed:`, err && err.stack ? err.stack : err);
    process.exit(1);
  });
