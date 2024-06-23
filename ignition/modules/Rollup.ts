import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RollupModule = buildModule("RollupModule", (m) => {
  const rollup = m.contract("OptimisticRollup");

  return { rollup };
});

export default RollupModule;
