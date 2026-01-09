const { AwsS3Store } = require('wwebjs-aws-s3');
const {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const s3 = new S3Client({
    region: 'auto',
    endpoint: 'https://5cd2f9ea7a228d411b0d8d3d4d1aa392.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: 'acbbab350d4a6e75328a09f57c340970',
        secretAccessKey: '0c8e169a6cfd559915ab7ece58784afa6b38936c0c64a195a19607cd0189fcd3'
    },
    forcePathStyle: true,
});

const putObjectCommand = PutObjectCommand;
const headObjectCommand = HeadObjectCommand;
const getObjectCommand = GetObjectCommand;
const deleteObjectCommand = DeleteObjectCommand;

export const store = new AwsS3Store({
    bucketName: 'wwebjsauthstore',
    remoteDataPath: 'authdata',
    s3Client: s3,
    putObjectCommand,
    headObjectCommand,
    getObjectCommand,
    deleteObjectCommand
});