// PM2 process file for zieclip production on Sumopod VPS.
//
// PM2 keeps the Next.js server alive across crashes, exposes a `pm2 logs`
// stream, and starts the app automatically on reboot (paired with
// `pm2 startup` + `pm2 save`, see DEPLOY-VPS.md).
//
// Two logical instances:
//   - zieclip     : the production app, port 3000, .env.production loaded
//                   from disk (kept OUT of git; scp to /home/ubuntu/zieclip/)
//   - zieclip-dev : optional. If you want to run a staging build on the
//                   same VPS (port 3001), uncomment the second block.
module.exports = {
  apps: [
    {
      name: 'zieclip',
      cwd: '/home/ubuntu/zieclip/current',
      // `next start` reads .env.production automatically when NODE_ENV=production,
      // so no need to pass anything extra here -- the file just has to exist
      // next to package.json.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,          // Next.js is I/O bound + serverless-friendly; one
                             // process is enough for a single 4 GB VPS.
                             // Bump to 'max' only after you've verified CPU is
                             // the bottleneck (usually ffmpeg is, and that's
                             // spawned as a child process regardless).
      exec_mode: 'fork',
      max_memory_restart: '1500M',   // hard restart if a leak eats past 1.5 GB
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      // Log rotation: PM2's built-in rotate module (`pm2 install pm2-logrotate`)
      // will trim these; without it they grow unbounded.
      error_file: '/home/ubuntu/zieclip/logs/error.log',
      out_file: '/home/ubuntu/zieclip/logs/out.log',
      merge_logs: true,
      time: true,
    },

    // Uncomment for a staging/preview instance on port 3001:
    // {
    //   name: 'zieclip-staging',
    //   cwd: '/home/ubuntu/zieclip/staging',
    //   script: 'node_modules/next/dist/bin/next',
    //   args: 'start -p 3001',
    //   env: { NODE_ENV: 'production', PORT: '3001' },
    // },
  ],
}
