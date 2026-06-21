/**
 * Ambient type declarations for optional S3 peer dependencies.
 *
 * The `S3Driver` uses dynamic `import('@aws-sdk/...')` so users only
 * install the AWS SDK when they actually use S3/R2. TypeScript needs
 * to know about these modules even when not installed — declare them
 * here as `any`.
 */
declare module "@aws-sdk/client-s3" {
	export class S3Client {
		constructor(config: any);
		send(command: any): Promise<any>;
	}
	export class PutObjectCommand {
		constructor(input: any);
	}
	export class GetObjectCommand {
		constructor(input: any);
	}
	export class DeleteObjectCommand {
		constructor(input: any);
	}
	export class HeadObjectCommand {
		constructor(input: any);
	}
	export class ListObjectsV2Command {
		constructor(input: any);
	}
	export class CopyObjectCommand {
		constructor(input: any);
	}
}

declare module "@aws-sdk/s3-request-presigner" {
	export const getSignedUrl: (
		client: any,
		command: any,
		options: { expiresIn?: number },
	) => Promise<string>;
}
