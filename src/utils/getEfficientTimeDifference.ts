export function getEfficientTimeDifference(date1: Date, date2?: Date): string {
	if (!date2) date2 = new Date();

	const diffMs = Math.abs(date2.getTime() - date1.getTime());
	const diffSec = diffMs / 1000;
	const diffMin = diffSec / 60;
	const diffHours = diffMin / 60;
	const diffDays = diffHours / 24;

	if (diffSec < 1) {
		return `${diffMs}ms`;
	} else if (diffMin < 1) {
		return `${Math.floor(diffSec)}s`;
	} else if (diffHours < 1) {
		return `${Math.floor(diffMin)}m${Math.floor(diffSec % 60)}s`;
	} else if (diffDays < 1) {
		return `${Math.floor(diffHours)}h${Math.floor(diffMin % 60)}m`;
	} else {
		return `${Math.floor(diffDays)}d${Math.floor(diffHours % 24)}h`;
	}
}
