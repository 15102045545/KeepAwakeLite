/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f252a",
        muted: "#64717b",
        line: "#d7e0e5",
        field: "#edf2f5",
        run: "#14855b",
        stop: "#c83b34",
        accent: "#2563eb",
        console: "#101719",
      },
      fontFamily: {
        sans: [
          "Segoe UI Variable",
          "Segoe UI",
          "PingFang SC",
          "Microsoft YaHei UI",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: ["Cascadia Mono", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
