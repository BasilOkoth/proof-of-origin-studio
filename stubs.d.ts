declare module "react" {
  namespace React {
    type ReactNode = any;
    interface FC<P = {}> { (props: P): any; }
  }
  const React: { Fragment: any };
  export = React;
}
declare module "react/jsx-runtime" { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module "remotion" {
  export const AbsoluteFill: any;
  export const Audio: any;
  export const Img: any;
  export const Sequence: any;
  export function interpolate(...args: any[]): any;
  export function spring(...args: any[]): any;
  export function useCurrentFrame(): number;
  export function useVideoConfig(): any;
}
declare namespace JSX { interface IntrinsicElements { [elemName: string]: any; } }
