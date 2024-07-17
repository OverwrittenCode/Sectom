module.exports = {
	env: {
		browser: true,
		es2021: true
	},
	extends: [ "plugin:prettier/recommended", "prettier"],
	plugins: ["@stylistic", "@stylistic/migrate", "import", "prettier", "@typescript-eslint"],
	parser: "@typescript-eslint/parser",
	root: true,
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module"
	},
	rules: {
		"@typescript-eslint/no-unused-vars": 2,
		"@typescript-eslint/consistent-type-imports": "error",
		"@typescript-eslint/no-dupe-class-members": "off",
		"@typescript-eslint/no-unused-vars": "off",

		"@stylistic/brace-style": ["error", "1tbs", { allowSingleLine: false }],
		"@stylistic/object-curly-spacing": ["error", "always"],
		"@stylistic/linebreak-style": ["error", "unix"],
		"@stylistic/ban-types": "off",
		"@stylistic/no-unused-vars": "off",
		"@stylistic/no-explicit-any": "off",
		"@stylistic/no-duplicate-enum-values": "off",
		"@stylistic/comma-dangle": "off",
		"@stylistic/no-namespace": "off",
		"@stylistic/indent": "off",
		"@stylistic/quotes": ["error", "double"],
		"@stylistic/semi": ["error", "always"],

		"no-unused-vars": "off",
		"no-dupe-class-members": "off",
		"curly": ["error", "all"],
		"prettier/prettier": "off",
		"arrow-body-style": "off",
		"prefer-arrow-callback": "off",

		"no-constant-condition": [
			"error",
			{
				checkLoops: false
			}
		],

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
