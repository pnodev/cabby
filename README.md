# Cabby - File Storage & Image Optimization Server

![Cabby Logo](./logo.svg)

Cabby is a file storage server with built-in image optimization capabilities. It provides a simple API for storing, retrieving, and transforming files, with special support for image manipulation and caching.

## License

Cabby is open source software licensed under the MIT License.
See the `LICENSE` file for details.

## Environment Variables

Before running the application, you need to set the following environment variables:

### Required

- **`FILE_STORAGE_PATH`** - The absolute path to the directory where files will be stored.
  ```bash
  FILE_STORAGE_PATH=/path/to/your/storage
  ```

### Optional

- **`FILE_CACHE_PATH`** - The absolute path to the cache directory for transformed images. If not set, defaults to `{FILE_STORAGE_PATH}/.cache`.
  ```bash
  FILE_CACHE_PATH=/path/to/your/cache
  ```

### Example `.env` file

Create a `.env` file in the project root:

```bash
FILE_STORAGE_PATH=/Users/username/Documents/filestorage
FILE_CACHE_PATH=/Users/username/Documents/filestorage/.cache
```

## Deployment

Cabby is deployment-target agnostic and can be run:

- Directly with Node.js in production using `npm run build` and `npm start`
- Under a process manager such as pm2
- In containers using the provided `Dockerfile` and `deploy/docker-compose.example.yml`

For detailed instructions, including environment variables, pm2 usage,
Docker examples, reverse-proxy configuration, and a sample GitLab CI + pm2
setup, see:

- `docs/deployment.md`

## API Usage

### Get a File

Retrieve a file from storage:

```
GET /files/{pathToFile}
```

**Example:**
```
GET /files/images/test.jpg
```

### Image Transformations

For image files, you can use query parameters to transform the image:

```
GET /files/{pathToFile}?size={width}x{height}&format={format}
```

**Parameters:**
- `size` (optional) - Resize the image to the specified dimensions (e.g., `180x240`)
- `format` (optional) - Convert the image to a different format. Supported output formats: `webp`, `avif`, `png`, `jpg`, `jpeg`

**Note:** The server can read images in formats: `jpg`, `jpeg`, `png`, `gif`, `webp`, `avif`, `tiff`, `bmp`, `svg`. However, conversion is only supported to: `webp`, `avif`, `png`, `jpg`, `jpeg`.

**Examples:**
```
# Resize to 180x240 pixels
GET /files/images/test.jpg?size=180x240

# Convert to WebP format
GET /files/images/test.jpg?format=webp

# Resize and convert to WebP
GET /files/images/test.jpg?size=180x240&format=webp
```

**Note:** Transformation parameters (`size` and `format`) are only available for image files. The transformed images are cached automatically and will be reused on subsequent requests.

### Upload a File

Upload a new file to storage:

```
POST /upload
Content-Type: multipart/form-data
```

**Form Data:**
- `file` - The file to upload (File object)
- `path` - The path where the file should be stored (relative to `FILE_STORAGE_PATH`)

**Example using curl:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/local/file.jpg" \
  -F "path=images/uploaded-file.jpg"
```

**Response:**
```json
{
  "success": true,
  "path": "images/uploaded-file.jpg"
}
```

### Management UI

The application includes a web-based management interface:

- **`GET /`** - List all files in storage with their cache status
- **`GET /file/{path}`** - View details for a specific file, including cached versions (for images)
- **`GET /upload`** - Upload interface for files

## Getting Started

To run this application:

```bash
npm install
npm run dev
```

# Building For Production

To build this application for production:

```bash
npm run build
```

## Testing

This project uses [Vitest](https://vitest.dev/) for testing. You can run the tests with:

```bash
npm run test
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Uninstall the packages: `npm install @tailwindcss/vite tailwindcss -D`

## Linting & Formatting


This project uses [eslint](https://eslint.org/) and [prettier](https://prettier.io/) for linting and formatting. Eslint is configured using [tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint). The following scripts are available:

```bash
npm run lint
npm run format
npm run check
```


## Shadcn

Add components using the latest version of [Shadcn](https://ui.shadcn.com/).

```bash
pnpm dlx shadcn@latest add button
```



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
