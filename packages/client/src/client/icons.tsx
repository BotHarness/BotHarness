import type { ReactElement, ReactNode } from 'react';

export interface IconProps {
  size: number;
}

function Svg({ size, children }: IconProps & { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="m17 17l4 4m-2-10a8 8 0 1 0-16 0a8 8 0 0 0 16 0"
      />
    </Svg>
  );
}

export function PlusIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M12 4v16m8-8H4"
      />
    </Svg>
  );
}

export function RobotIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <path d="M12 4V2m8 20a8 8 0 1 0-16 0M9.375 8.25H9.25m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m5.375 0h-.125m.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0" />
        <path d="M15.154 4H8.846c-1.255 0-1.883 0-2.372.22A2.5 2.5 0 0 0 5.22 5.474C5 5.964 5 6.591 5 7.846c0 2.008 0 3.013.352 3.796a4 4 0 0 0 2.006 2.006C8.141 14 9.146 14 11.154 14h1.692c2.008 0 3.013 0 3.796-.352a4 4 0 0 0 2.006-2.006C19 10.859 19 9.854 19 7.846c0-1.255 0-1.883-.22-2.372a2.5 2.5 0 0 0-1.254-1.254C17.036 4 16.409 4 15.154 4" />
      </g>
    </Svg>
  );
}

export function PlugIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 2v4m-7 0V2" />
        <path d="M6.004 7.613C5.937 6.743 6.64 6 7.53 6h8.94c.89 0 1.593.743 1.526 1.613l-.184 2.379a9.9 9.9 0 0 1-1.68 4.785l-.6.885A3.08 3.08 0 0 1 12.983 17h-1.968a3.08 3.08 0 0 1-2.547-1.338l-.601-.885a9.9 9.9 0 0 1-1.68-4.785z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17v5M11 9h2" />
      </g>
    </Svg>
  );
}

export function SettingsIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path
          strokeLinecap="round"
          d="m21.318 7.141l-.494-.856c-.373-.648-.56-.972-.878-1.101c-.317-.13-.676-.027-1.395.176l-1.22.344c-.459.106-.94.046-1.358-.17l-.337-.194a2 2 0 0 1-.788-.967l-.334-.998c-.22-.66-.33-.99-.591-1.178c-.261-.19-.609-.19-1.303-.19h-1.115c-.694 0-1.041 0-1.303.19c-.261.188-.37.518-.59 1.178l-.334.998a2 2 0 0 1-.789.967l-.337.195c-.418.215-.9.275-1.358.17l-1.22-.345c-.719-.203-1.078-.305-1.395-.176c-.318.129-.505.453-.878 1.1l-.493.857c-.35.608-.525.911-.491 1.234c.034.324.268.584.736 1.105l1.031 1.153c.252.319.431.875.431 1.375s-.179 1.056-.43 1.375l-1.032 1.152c-.468.521-.702.782-.736 1.105s.14.627.49 1.234l.494.857c.373.647.56.971.878 1.1s.676.028 1.395-.176l1.22-.344a2 2 0 0 1 1.359.17l.336.194c.36.23.636.57.788.968l.334.997c.22.66.33.99.591 1.18c.262.188.609.188 1.303.188h1.115c.694 0 1.042 0 1.303-.189s.371-.519.59-1.179l.335-.997c.152-.399.428-.738.788-.968l.336-.194c.42-.215.9-.276 1.36-.17l1.22.344c.718.204 1.077.306 1.394.177c.318-.13.505-.454.878-1.101l.493-.857c.35-.607.525-.91.491-1.234s-.268-.584-.736-1.105l-1.031-1.152c-.252-.32-.431-.875-.431-1.375s.179-1.056.43-1.375l1.032-1.153c.468-.52.702-.781.736-1.105s-.14-.626-.49-1.234Z"
        />
        <path d="M15.52 12a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0Z" />
      </g>
    </Svg>
  );
}

export function ChatIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M7.5 8.5h9m-9 4H13m-11-2c0-.77.013-1.523.04-2.25c.083-2.373.125-3.56 1.09-4.533c.965-.972 2.186-1.024 4.626-1.129A100 100 0 0 1 12 2.5c1.48 0 2.905.03 4.244.088c2.44.105 3.66.157 4.626 1.13c.965.972 1.007 2.159 1.09 4.532a64 64 0 0 1 0 4.5c-.083 2.373-.125 3.56-1.09 4.533c-.965.972-2.186 1.024-4.626 1.129q-1.102.047-2.275.07c-.74.014-1.111.02-1.437.145s-.6.358-1.148.828l-2.179 1.87A.73.73 0 0 1 8 20.77v-2.348l-.244-.01c-2.44-.105-3.66-.157-4.626-1.13c-.965-.972-1.007-2.159-1.09-4.532A64 64 0 0 1 2 10.5"
      />
    </Svg>
  );
}

export function DashboardIcon({ size }: IconProps): ReactElement {
  return (
    <Svg size={size}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M13.69 19.457c-.19-.46-.19-1.042-.19-2.207s0-1.747.19-2.207a2.5 2.5 0 0 1 1.353-1.353c.46-.19 1.042-.19 2.207-.19s1.747 0 2.207.19a2.5 2.5 0 0 1 1.353 1.353c.19.46.19 1.042.19 2.207s0 1.747-.19 2.207a2.5 2.5 0 0 1-1.353 1.353c-.46.19-1.042.19-2.207.19s-1.747 0-2.207-.19a2.5 2.5 0 0 1-1.353-1.353Zm0-10.5c-.19-.46-.19-1.042-.19-2.207s0-1.747.19-2.207a2.5 2.5 0 0 1 1.353-1.353C15.503 3 16.085 3 17.25 3s1.747 0 2.207.19a2.5 2.5 0 0 1 1.353 1.353c.19.46.19 1.042.19 2.207s0 1.747-.19 2.207a2.5 2.5 0 0 1-1.353 1.353c-.46.19-1.042.19-2.207.19s-1.747 0-2.207-.19a2.5 2.5 0 0 1-1.353-1.353Zm-10.5 10.5C3 18.997 3 18.415 3 17.25s0-1.747.19-2.207a2.5 2.5 0 0 1 1.353-1.353c.46-.19 1.042-.19 2.207-.19s1.747 0 2.207.19a2.5 2.5 0 0 1 1.353 1.353c.19.46.19 1.042.19 2.207s0 1.747-.19 2.207a2.5 2.5 0 0 1-1.353 1.353c-.46.19-1.042.19-2.207.19s-1.747 0-2.207-.19a2.5 2.5 0 0 1-1.353-1.353Zm0-10.5C3 8.497 3 7.915 3 6.75s0-1.747.19-2.207A2.5 2.5 0 0 1 4.543 3.19C5.003 3 5.585 3 6.75 3s1.747 0 2.207.19a2.5 2.5 0 0 1 1.353 1.353c.19.46.19 1.042.19 2.207s0 1.747-.19 2.207a2.5 2.5 0 0 1-1.353 1.353c-.46.19-1.042.19-2.207.19s-1.747 0-2.207-.19A2.5 2.5 0 0 1 3.19 8.957Z"
      />
    </Svg>
  );
}
