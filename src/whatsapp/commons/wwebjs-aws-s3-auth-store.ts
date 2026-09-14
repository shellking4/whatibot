import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} from '@aws-sdk/client-s3';

// Local directory RemoteAuth works in. whatsapp-web.js >= 1.34.7 writes the session zip here
// (not in the process cwd, which is where the wwebjs-aws-s3 package used to look for it).
export const WWEBJS_AUTH_DATA_PATH = path.resolve('.wwebjs_auth');

const s3 = new S3Client({
    region: 'auto',
    endpoint: 'https://5cd2f9ea7a228d411b0d8d3d4d1aa392.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: 'acbbab350d4a6e75328a09f57c340970',
        secretAccessKey: '0c8e169a6cfd559915ab7ece58784afa6b38936c0c64a195a19607cd0189fcd3'
    },
    forcePathStyle: true,
});

const bucketName = 'wwebjsauthstore';
const remoteDataPath = 'authdata';

const remoteKey = (session: string) => `${remoteDataPath}/${session}.zip`;

// RemoteAuth store backed by Cloudflare R2 (S3 API).
// Unlike wwebjs-aws-s3, errors other than "not found" are thrown instead of swallowed.
export const store = {

    async sessionExists({ session }: { session: string }): Promise<boolean> {
        try {
            await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: remoteKey(session) }));
            return true;
        } catch (error) {
            if (error?.name === 'NotFound' || error?.name === 'NoSuchKey') return false;
            console.error('[AUTH STORE] sessionExists failed', error);
            throw error;
        }
    },

    async save({ session }: { session: string }): Promise<void> {
        const zipPath = path.join(WWEBJS_AUTH_DATA_PATH, `${session}.zip`);
        const body = await fs.promises.readFile(zipPath);
        await s3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: remoteKey(session),
            Body: body,
            ContentType: 'application/zip'
        }));
        console.log(`[AUTH STORE] session saved to ${bucketName}/${remoteKey(session)} (${body.length} bytes)`);
    },

    async extract({ session, path: zipPath }: { session: string, path: string }): Promise<void> {
        await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
        const response = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: remoteKey(session) }));
        await pipeline(response.Body as Readable, fs.createWriteStream(zipPath));
        console.log(`[AUTH STORE] session restored from ${bucketName}/${remoteKey(session)}`);
    },

    async delete({ session }: { session: string }): Promise<void> {
        await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: remoteKey(session) }));
        console.log(`[AUTH STORE] session deleted from ${bucketName}/${remoteKey(session)}`);
    },

};
