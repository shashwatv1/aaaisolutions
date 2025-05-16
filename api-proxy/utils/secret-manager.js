const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

const client = new SecretManagerServiceClient();

/**
 * Retrieve a secret from Google Cloud Secret Manager
 * @param {string} secretName - Name of the secret to retrieve
 * @returns {Promise<string>} - The secret value
 */
async function getSecret(secretName) {
  try {
    const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await client.accessSecretVersion({name});
    return version.payload.data.toString();
  } catch (error) {
    console.error(`Error accessing secret ${secretName}:`, error);
    throw new Error(`Could not access secret: ${secretName}`);
  }
}

module.exports = {
  getSecret
};