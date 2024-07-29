module.exports = {
	env: {
		browser: true,
		es2021: true
	},
	extends: ["plugin:prettier/recommended", "prettier"],
	plugins: ["@stylistic", "@stylistic/migrate", "import", "prettier", "@typescript-eslint"],
	parser: "@typescript-eslint/parser",
	root: true,
	parserOptions: {
		ecmaVersion: "latest",
		sourceType: "module"
	},
	rules: {
		"@typescript-eslint/no-unused-vars": [
			"error",
			{
				"args": "all",
				"argsIgnorePattern": "^_",
				"caughtErrors": "all",
				"caughtErrorsIgnorePattern": "^_",
				"destructuredArrayIgnorePattern": "^_",
				"varsIgnorePattern": "^_|JSX",
				"ignoreRestSiblings": true
			}
		],
		"@typescript-eslint/consistent-type-imports": "error",
		"@typescript-eslint/no-dupe-class-members": "off",

		"@stylistic/padding-line-between-statements": [
			"error",
			{ blankLine: "always", prev: "*", next: ["interface", "type", "break", "for", "if", "function", "const", "let"] },
			{ blankLine: "always", prev: ["interface", "type", "break", "for", "if", "function", "const", "let"], next: "*" },
			{ blankLine: "any", prev: ["const"], next: ["const"] },
			{ blankLine: "any", prev: ["let"], next: ["let"] },
			{ blankLine: "never", prev: "if", next: "empty" },
			{ blankLine: "never", prev: "function-overload", next: "function" },
		],
		// will be added once exceptAfterOverload works
		// "@stylistic/lines-between-class-members": [
		// 	"error",
		// 	{
		// 		enforce: [
		// 			{ blankLine: "always", prev: "method", next: "method" }
		// 		]
		// 	},
		// 	 { exceptAfterOverload: true }
		// ],
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
		"no-var": ["error"],
		"curly": ["error", "all"],
		"prettier/prettier": "off",
		"arrow-body-style": "off",
		"prefer-arrow-callback": "off",
		"prefer-const": ["error"],

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
