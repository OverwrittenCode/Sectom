module.exports = {
	env: {
		browser: true,
		es2021: true
	},
	extends: [
		"eslint:recommended",
		"plugin:@typescript-eslint/recommended",
		"plugin:prettier/recommended",
		"prettier"
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module"
	},
	plugins: ["@typescript-eslint", "import", "prettier"],
	rules: {
		"@typescript-eslint/ban-types": "off",
		"@typescript-eslint/no-unused-vars": "off",
		"@typescript-eslint/no-explicit-any": "off",
		"comma-dangle": "off",
		indent: "off",
		"linebreak-style": ["error", "unix"],
		quotes: ["error", "double"],
		semi: ["error", "always"],
		"arrow-body-style": "off",
		"prefer-arrow-callback": "off",
		"import/order": [
			"error",
			{
				groups: [
					"builtin",
					"external",
					"internal",
					"parent",
					"sibling",
					"index"
				],
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
