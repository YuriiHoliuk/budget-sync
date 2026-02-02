import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../src/presentation/graphql/schema/*.graphql",
  documents: "src/graphql/**/*.graphql",
  generates: {
    "src/graphql/generated/": {
      preset: "client",
      config: {},
    },
  },
  ignoreNoDocuments: true,
};

export default config;
