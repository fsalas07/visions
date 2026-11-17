// Articles are served through the API Worker. The raw markdown files are not
// part of the site.
export const onRequest = () => new Response('Not found', { status: 404 });
