import * as crypto from 'node:crypto';

export class StringUtils {
    static normalizeSpace(text: string): string {
        if (!text) {
            return text;
        }
        return text.trim().replace(/ {2,}/g, ' ');
    }

    static async generateCode(codeLength?: number): Promise<string> {
        codeLength = codeLength || 6;
        return new Promise((res, rej) => {
            crypto.randomInt(1, parseInt('1'.padEnd(codeLength, '0'), 10), (err, n) => {
                if (err) return rej(err);
                res(n.toString().padStart(codeLength, '0'));
            });
        });
    }
}
