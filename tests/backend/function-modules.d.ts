// Netlify's JavaScript handlers share the Request/Response function contract.
declare module '*.mjs' {
  const handler: (request: Request) => Promise<Response>
  export default handler
}
