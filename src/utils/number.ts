export abstract class NumberUtils {
	public static chunkByModulus(count: number, chunkSize: number): number[] {
		const chunks = new Array(Math.floor(count / chunkSize)).fill(chunkSize);
		const remainder = count % chunkSize;
		if (remainder > 0) {
			chunks.push(remainder);
		}
		return chunks;
	}
}
