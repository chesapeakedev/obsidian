import * as gqlModule from "graphql-tag";
// @ts-expect-error - graphql-tag default export is callable but types may not reflect this in Deno
// FIXME: fork graphql-tag to make it more deno-y
const gql = gqlModule.default as (query: string) => unknown;
import { type DocumentNode, print, visit } from "graphql";

/**
 * The restructure function:
 * - it converts the query string into an AST with the visitor pattern design.
 * - it handles fragments.
 * - it handles
 *
 * @param  {any} value - Query string
 * @return {string} string
 */
export function restructure(
  value: {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
  },
) {
  const variables = value.variables || {};
  const operationName = value.operationName;

  let ast = gql(value.query) as DocumentNode;

  let fragments: { [key: string]: unknown } = {};
  let containsFrags: boolean = false;
  const existingFrags: { [key: string]: unknown } = {};
  const existingVars: { [key: string]: unknown } = {};

  const buildFragsVisitor = {
    FragmentDefinition: (node: Record<string, unknown>) => {
      fragments[(node.name as { value: string }).value] =
        (node.selectionSet as { selections: unknown }).selections;
    },
  };
  const buildDefaultVarsVisitor = {
    VariableDefinition: (node: Record<string, unknown>) => {
      if (node.defaultValue) {
        const varName = (node.variable as { name: { value: string } }).name
          .value;
        if (!variables[varName]) {
          variables[varName] = (node.defaultValue as { value: unknown }).value;
        }
      }
    },
  };

  const rewriteVarsVistor = {
    VariableDefinition: (_node: Record<string, unknown>) => {
      return null;
    },
    Variable: (node: Record<string, unknown>) => {
      const varName = (node.name as { value: string }).value;
      if (Object.prototype.hasOwnProperty.call(variables, varName)) {
        return { kind: "EnumValue", value: variables[varName] };
      }
    },
  };

  const rewriteVisitor = {
    FragmentSpread: (node: Record<string, unknown>) => {
      const fragName = (node.name as { value: string }).value;
      if (Object.prototype.hasOwnProperty.call(fragments, fragName)) {
        return fragments[fragName];
      }
    },
  };

  const clearFragVisitor = {
    FragmentDefinition: (node: Record<string, unknown>) => {
      const fragName = (node.name as { value: string }).value;
      if (Object.prototype.hasOwnProperty.call(fragments, fragName)) {
        return null;
      }
    },
  };
  const checkFragmentationVisitor = {
    FragmentSpread: (node: Record<string, unknown>) => {
      containsFrags = true;
      existingFrags[(node.name as { value: string }).value] = true;
    },
    Variable: (node: Record<string, unknown>) => {
      containsFrags = true;
      existingVars[(node.name as { value: string }).value] = true;
    },
  };

  const firstBuildVisitor = {
    ...buildFragsVisitor,
    ...buildDefaultVarsVisitor,
  };

  const firstRewriteVisitor = {
    ...rewriteVisitor,
    ...rewriteVarsVistor,
    OperationDefinition: (node: Record<string, unknown>) => {
      if (
        operationName && (node.name as { value: string }).value != operationName
      ) {
        return null;
      }
    },
    InlineFragment: (node: Record<string, unknown>) => {
      return [
        {
          kind: "Field",
          alias: undefined,
          name: { kind: "Name", value: "__typename" },
          arguments: [],
          directives: [],
          selectionSet: undefined,
        },
        node,
      ];
    },
  };

  // Type assertion necessary: GraphQL's visit expects specific AST node types, but our visitors
  // use Record<string, unknown> for flexibility. The visitors are type-safe at runtime.
  visit(
    ast,
    {
      leave: firstBuildVisitor,
    } as Parameters<typeof visit>[1],
  );

  ast = gql(
    print(
      visit(
        ast,
        {
          leave: firstRewriteVisitor,
        } as Parameters<typeof visit>[1],
      ),
    ),
  ) as unknown as DocumentNode;
  visit(
    ast,
    {
      leave: checkFragmentationVisitor,
    } as Parameters<typeof visit>[1],
  );
  while (containsFrags) {
    containsFrags = false;
    fragments = {};
    // Type assertion necessary: GraphQL's visit expects specific AST node types, but our visitors
    // use Record<string, unknown> for flexibility. The visitors are type-safe at runtime.
    visit(
      ast,
      {
        enter: buildFragsVisitor,
      } as Parameters<typeof visit>[1],
    );

    ast = gql(
      print(
        visit(
          ast,
          {
            leave: firstRewriteVisitor,
          } as Parameters<typeof visit>[1],
        ),
      ),
    ) as unknown as DocumentNode;
    visit(
      ast,
      {
        leave: checkFragmentationVisitor,
      } as Parameters<typeof visit>[1],
    );

    //if existingFrags has a key that fragments does not
    const exfragskeys = Object.keys(existingFrags);
    const fragskeys = Object.keys(fragments);
    const exvarsskeys = Object.keys(existingVars);
    const varkeys = Object.keys(variables);
    //exfragskeys.every(key=>fragskeys.includes(key))
    if (!exfragskeys.every((key) => fragskeys.includes(key))) {
      return console.log({ error: "missing fragment definitions" });
    }
    if (!exvarsskeys.every((key) => varkeys.includes(key))) {
      return console.log({ error: "missing variable definitions" });
    }
  }

  // Type assertion necessary: GraphQL's visit expects specific AST node types, but our visitors
  // use Record<string, unknown> for flexibility. The visitors are type-safe at runtime.
  ast = visit(
    ast,
    {
      leave: clearFragVisitor,
    } as Parameters<typeof visit>[1],
  );

  return print(ast);
}
