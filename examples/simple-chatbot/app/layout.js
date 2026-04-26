import './globals.css';

export const metadata = {
  title: 'aisdk-dt Next.js chatbot example',
  description:
    'Tool-calling chatbot example with AI SDK DevTools and aisdk-dt.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
