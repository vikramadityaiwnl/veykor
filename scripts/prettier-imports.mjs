import { printers } from "prettier/plugins/estree";
import { doc } from "prettier";

const printer = printers.estree;

export const printersWithInlineImports = {
  ...printer,
  print(path, options, print, args) {
    const result = printer.print(path, options, print, args);

    return path.node.type === "ImportDeclaration"
      ? doc.utils.removeLines(result)
      : result;
  },
};

export default {
  printers: {
    estree: printersWithInlineImports,
  },
};
