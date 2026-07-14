// Next.js перемонтирует template.tsx на КАЖДОЙ навигации (в отличие от layout.tsx) — даёт entrance-
// анимацию контенту при каждом переходе между вкладками, не только при первой загрузке. Персистентный
// хром (TopNav/Footer/MobileNav) живёт в layout.tsx, вне этого дерева — не переанимируется.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
