export default function handler(req, res) {
  res.status(403).setHeader('Content-Type', 'text/plain');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.end(
    '403 — Access Denied\n\n' +
    'This site does not permit automated crawling or AI training data collection.\n' +
    'See /robots.txt, /ai.txt, and /.well-known/tdmrep.json for our data mining policy.'
  );
}
