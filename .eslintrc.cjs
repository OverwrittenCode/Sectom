module.exports = {
	env: {
		browser: true,
		es2021: true
	},
	extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended", "prettier"],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module"
	},
	plugins: ["@typescript-eslint", "import", "prettier"],
	rules: {
		"@typescript-eslint/consistent-type-imports": "error",
		"@typescript-eslint/ban-types": "off",
		"@typescript-eslint/no-unused-vars": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"@typescript-eslint/no-duplicate-enum-values": "off",
		"@typescript-eslint/no-namespace": "off",
		"prettier/prettier": "off",
		"object-curly-spacing": ["error", "always"],
		"comma-dangle": "off",
		"brace-style": ["error", "1tbs", { allowSingleLine: true }],
		"linebreak-style": ["error", "unix"],
		"arrow-body-style": "off",
		"prefer-arrow-callback": "off",
		"no-constant-condition": [
			"error",
			{
				checkLoops: false
			}
		],
		indent: "off",
		quotes: ["error", "double"],
		curly: ["error", "multi-line"],
		semi: ["error", "always"],

		"import/order": [
			"error",
			{
				pathGroups: [
					{
						pattern: "~/**",
						group: "internal",
						position: "after"
					}
				],
				groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
				"newlines-between": "always",
				alphabetize: {
					order: "asc",
					caseInsensitive: true
				}
			}
		],
		"sort-imports": [
			"error",
			{
				ignoreDeclarationSort: true
			}
		],
		"import/first": ["error"]
	}
};
