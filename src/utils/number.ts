export abstract class NumberUtils {
	public static chunkByModulus(count: number, chunkSize: number, withRemainder: boolean = true): number[] {
		const chunks = new Array(Math.floor(count / chunkSize)).fill(chunkSize);
		const remainder = count % chunkSize;
		if (remainder > 0 && withRemainder) {
			chunks.push(remainder);
		}
		return chunks;
	}

	public static getOrdinalSuffix(num: number): string {
		const suffixes = ["th", "st", "nd", "rd"];
		const value = num % 100;

		return num + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
	}
}
