const { Client } = require("basic-ftp");

const FTP_CONFIG = {
  host: process.env.JBI_FTP_HOST || "ftp.jbi.bike",
  user: process.env.JBI_FTP_USER || "anonymous",
  password: process.env.JBI_FTP_PASSWORD || "anonymous@",
  secure: false,
};

async function withFtpClient(fn) {
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access(FTP_CONFIG);
    return await fn(client);
  } finally {
    client.close();
  }
}

async function getRemoteModTime(remotePath) {
  return withFtpClient(async (client) => {
    return await client.lastMod(remotePath);
  });
}

module.exports = { withFtpClient, getRemoteModTime, FTP_CONFIG };
