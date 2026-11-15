// Geluidjes voor de timer, zelf opgewekt met Web Audio (geen geluidsbestanden nodig).
let ctx: AudioContext | null = null;

/** Moet aangeroepen worden vanuit een tik van de gebruiker, anders blijft de telefoon stil. */
export function unlockSound(): void {
	try {
		const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return;
		ctx ??= new AC();
		if (ctx.state === 'suspended') void ctx.resume();
	} catch {
		ctx = null;
	}
}

function beep(freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine') {
	if (!ctx) return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	const t = ctx.currentTime + start;
	gain.gain.setValueAtTime(0.0001, t);
	gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t);
	osc.stop(t + duration + 0.05);
}

/** Zacht tikje in de laatste seconden. */
export function tick(): void {
	try {
		beep(880, 0, 0.08, 0.15, 'triangle');
	} catch {
		/* geen geluid */
	}
}

/** De tijd is om: drie duidelijke piepjes. */
export function alarm(): void {
	try {
		for (let i = 0; i < 3; i++) {
			beep(660, i * 0.45, 0.32, 0.5, 'square');
			beep(990, i * 0.45 + 0.16, 0.16, 0.35, 'square');
		}
	} catch {
		/* geen geluid */
	}
	try {
		navigator.vibrate?.([300, 150, 300, 150, 300]);
	} catch {
		/* geen trilfunctie */
	}
}
