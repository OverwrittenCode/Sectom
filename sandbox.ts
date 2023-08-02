type SelectOption<T, S> = S extends string
	? NestedSelectString<T, S>
	: S extends string[]
	? SelectArray<T, S>
	: S extends infer O & object
	? SelectObject<T, O & Record<string, 0 | 1>>
	: never;

type NestedSelectString<T, S extends string> = S extends `${infer F}.${infer R}`
	? F extends keyof T
		? { [K in F]: NestedSelectString<T[F], R> }
		: never
	: S extends `${infer F} ${infer R}`
	? F extends keyof T
		? { [K in F]: T[F] } & NestedSelectString<T, R>
		: never
	: S extends `${infer F}[${infer I}]${infer R}`
	? F extends keyof T
		? T[F] extends Array<infer U>
			? {
					[K in F]: Array<NestedSelectString<U, `${I}${R}`>>;
			  } & NestedSelectString<T, R>
			: never
		: never
	: SelectString<T, S>;

type SelectString<T, S extends string> = {
	[K in S extends `${infer F} ${infer R}` ? F : S]: K extends keyof T
		? T[K]
		: never;
};

type SelectArray<T, S extends string[]> = {
	[K in S[number]]: K extends keyof T ? T[K] : never;
};

type SelectObject<T, S extends Record<string, 1 | 0>> = {
	[K in keyof S & keyof T]: S[K] extends 1 ? T[K] : never;
};

type Populate<T, S> = {
	[P in keyof T]: T[P] extends infer R
		? R extends Array<infer I>
			? S extends `${infer A}[${infer B}]${infer C}`
				? A extends P
					? Array<{ [K in B]: SelectOption<I, C> }>
					: Array<SelectOption<I, S>>
				: Array<SelectOption<I, S>>
			: SelectOption<R, S>
		: T[P];
};
