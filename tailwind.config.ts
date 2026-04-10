import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
  			mono: ['var(--font-geist-mono)', 'monospace'],
  		},
  		screens: {
  			'xs': '480px',
  		},
  		colors: {
  			background: 'oklch(var(--background) / <alpha-value>)',
  			foreground: 'oklch(var(--foreground) / <alpha-value>)',
  			gray: {
  				850: '#1a202e'
  			},
  			card: {
  				DEFAULT: 'oklch(var(--card) / <alpha-value>)',
  				foreground: 'oklch(var(--card-foreground) / <alpha-value>)'
  			},
  			popover: {
  				DEFAULT: 'oklch(var(--popover) / <alpha-value>)',
  				foreground: 'oklch(var(--popover-foreground) / <alpha-value>)'
  			},
  			primary: {
  				DEFAULT: 'oklch(var(--primary) / <alpha-value>)',
  				foreground: 'oklch(var(--primary-foreground) / <alpha-value>)'
  			},
  			secondary: {
  				DEFAULT: 'oklch(var(--secondary) / <alpha-value>)',
  				foreground: 'oklch(var(--secondary-foreground) / <alpha-value>)'
  			},
  			muted: {
  				DEFAULT: 'oklch(var(--muted) / <alpha-value>)',
  				foreground: 'oklch(var(--muted-foreground) / <alpha-value>)'
  			},
  			accent: {
  				DEFAULT: 'oklch(var(--accent) / <alpha-value>)',
  				foreground: 'oklch(var(--accent-foreground) / <alpha-value>)'
  			},
  			destructive: {
  				DEFAULT: 'oklch(var(--destructive) / <alpha-value>)',
  				foreground: 'oklch(var(--destructive-foreground) / <alpha-value>)'
  			},
  			border: 'oklch(var(--border) / <alpha-value>)',
  			input: 'oklch(var(--input) / <alpha-value>)',
  			ring: 'oklch(var(--ring) / <alpha-value>)',
  			chart: {
  				'1': 'oklch(var(--chart-1) / <alpha-value>)',
  				'2': 'oklch(var(--chart-2) / <alpha-value>)',
  				'3': 'oklch(var(--chart-3) / <alpha-value>)',
  				'4': 'oklch(var(--chart-4) / <alpha-value>)',
  				'5': 'oklch(var(--chart-5) / <alpha-value>)'
  			},
  			sidebar: {
  				DEFAULT: 'oklch(var(--sidebar-background) / <alpha-value>)',
  				foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
  				primary: 'oklch(var(--sidebar-primary) / <alpha-value>)',
  				'primary-foreground': 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
  				accent: 'oklch(var(--sidebar-accent) / <alpha-value>)',
  				'accent-foreground': 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
  				border: 'oklch(var(--sidebar-border) / <alpha-value>)',
  				ring: 'oklch(var(--sidebar-ring) / <alpha-value>)'
  			}
  		},
  		borderRadius: {
  			'4xl': 'calc(var(--radius) + 16px)',
  			'3xl': 'calc(var(--radius) + 12px)',
  			'2xl': 'calc(var(--radius) + 8px)',
  			xl: 'calc(var(--radius) + 4px)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'lightning-strike': {
  				'0%': {
  					opacity: '0',
  					transform: 'translateY(-20px) scaleY(0.5)',
  					filter: 'brightness(2)'
  				},
  				'15%': {
  					opacity: '1',
  					transform: 'translateY(0) scaleY(1.2)',
  					filter: 'brightness(3)'
  				},
  				'25%': {
  					opacity: '1',
  					transform: 'translateY(0) scaleY(1)',
  					filter: 'brightness(2.5)'
  				},
  				'35%': {
  					opacity: '0.8',
  					transform: 'translateY(0) scaleX(1.1)',
  					filter: 'brightness(2)'
  				},
  				'50%': {
  					opacity: '0.3',
  					transform: 'translateY(0) scaleX(0.9)',
  					filter: 'brightness(1.5)'
  				},
  				'65%': {
  					opacity: '0',
  					transform: 'translateY(5px) scale(0.8)',
  					filter: 'brightness(1)'
  				},
  				'100%': {
  					opacity: '0',
  					transform: 'translateY(10px) scale(0.6)'
  				}
  			},
  			'chain-form': {
  				'0%, 40%': {
  					opacity: '0',
  					transform: 'scale(0) rotate(-180deg)'
  				},
  				'60%': {
  					opacity: '0.5',
  					transform: 'scale(0.8) rotate(-90deg)'
  				},
  				'80%': {
  					opacity: '0.8',
  					transform: 'scale(1.1) rotate(-45deg)'
  				},
  				'100%': {
  					opacity: '1',
  					transform: 'scale(1) rotate(0deg)'
  				}
  			},
  			'chain-shimmer': {
  				'0%, 100%': {
  					filter: 'brightness(1) drop-shadow(0 0 2px currentColor)'
  				},
  				'50%': {
  					filter: 'brightness(1.4) drop-shadow(0 0 6px currentColor)'
  				}
  			},
  			'electric-pulse': {
  				'0%, 100%': {
  					opacity: '0.3'
  				},
  				'10%, 30%, 50%': {
  					opacity: '0.6'
  				},
  				'20%, 40%': {
  					opacity: '0.4'
  				}
  			},
  			'flash': {
  				'0%, 100%': {
  					opacity: '0'
  				},
  				'10%, 15%': {
  					opacity: '0.6'
  				}
  			},
  			'link-forge-1': {
  				'0%, 45%': {
  					strokeDasharray: '0 100',
  					opacity: '0'
  				},
  				'60%': {
  					strokeDasharray: '50 50',
  					opacity: '0.6'
  				},
  				'100%': {
  					strokeDasharray: '100 0',
  					opacity: '0.9'
  				}
  			},
  			'link-forge-2': {
  				'0%, 55%': {
  					strokeDasharray: '0 100',
  					opacity: '0'
  				},
  				'70%': {
  					strokeDasharray: '50 50',
  					opacity: '0.6'
  				},
  				'100%': {
  					strokeDasharray: '100 0',
  					opacity: '0.9'
  				}
  			},
  			'impact-wave': {
  				'0%, 35%': {
  					opacity: '0',
  					transform: 'scale(0)'
  				},
  				'40%': {
  					opacity: '0.8',
  					transform: 'scale(1)'
  				},
  				'100%': {
  					opacity: '0',
  					transform: 'scale(3)'
  				}
  			},
  			'ripple': {
  				'0%': {
  					width: '0',
  					height: '0',
  					opacity: '0'
  				},
  				'40%': {
  					width: '20px',
  					height: '2px',
  					opacity: '0.8'
  				},
  				'100%': {
  					width: '40px',
  					height: '1px',
  					opacity: '0'
  				}
  			},
  			'sparkle': {
  				'0%, 100%': {
  					opacity: '0'
  				},
  				'30%, 70%': {
  					opacity: '1'
  				}
  			},
  			'spark-1': {
  				'0%, 100%': {
  					opacity: '0',
  					transform: 'translate(0, 0) scale(0)'
  				},
  				'35%': {
  					opacity: '1',
  					transform: 'translate(-5px, -5px) scale(1)'
  				},
  				'70%': {
  					opacity: '0',
  					transform: 'translate(-10px, -10px) scale(0.5)'
  				}
  			},
  			'spark-2': {
  				'0%, 100%': {
  					opacity: '0',
  					transform: 'translate(0, 0) scale(0)'
  				},
  				'40%': {
  					opacity: '1',
  					transform: 'translate(5px, 5px) scale(1)'
  				},
  				'75%': {
  					opacity: '0',
  					transform: 'translate(10px, 10px) scale(0.5)'
  				}
  			},
  			'spark-3': {
  				'0%, 100%': {
  					opacity: '0',
  					transform: 'translate(0, 0) scale(0)'
  				},
  				'45%': {
  					opacity: '1',
  					transform: 'translate(0, -8px) scale(1)'
  				},
  				'80%': {
  					opacity: '0',
  					transform: 'translate(0, -16px) scale(0.5)'
  				}
  			},
  			'blob': {
  				'0%': {
  					transform: 'translate(0px, 0px) scale(1)'
  				},
  				'33%': {
  					transform: 'translate(30px, -50px) scale(1.1)'
  				},
  				'66%': {
  					transform: 'translate(-20px, 20px) scale(0.9)'
  				},
  				'100%': {
  					transform: 'translate(0px, 0px) scale(1)'
  				}
  			},
  			'blob-slow': {
  				'0%': {
  					transform: 'translate(0px, 0px) scale(1) rotate(0deg)'
  				},
  				'33%': {
  					transform: 'translate(40px, -60px) scale(1.15) rotate(120deg)'
  				},
  				'66%': {
  					transform: 'translate(-30px, 30px) scale(0.85) rotate(240deg)'
  				},
  				'100%': {
  					transform: 'translate(0px, 0px) scale(1) rotate(360deg)'
  				}
  			},
  			'fade-in': {
  				'0%': { opacity: '0' },
  				'100%': { opacity: '1' }
  			},
  			'fade-in-up': {
  				'0%': { opacity: '0', transform: 'translateY(16px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'fade-in-down': {
  				'0%': { opacity: '0', transform: 'translateY(-16px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			},
  			'slide-in-right': {
  				'0%': { opacity: '0', transform: 'translateX(16px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			'slide-in-left': {
  				'0%': { opacity: '0', transform: 'translateX(-16px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			'scale-in': {
  				'0%': { opacity: '0', transform: 'scale(0.95)' },
  				'100%': { opacity: '1', transform: 'scale(1)' }
  			},
  			'shimmer': {
  				'0%': { backgroundPosition: '-200% 0' },
  				'100%': { backgroundPosition: '200% 0' }
  			},
  			'count-up': {
  				'0%': { opacity: '0', transform: 'translateY(8px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.4s ease-out',
  			'fade-in-up': 'fade-in-up 0.5s ease-out',
  			'fade-in-down': 'fade-in-down 0.5s ease-out',
  			'slide-in-right': 'slide-in-right 0.4s ease-out',
  			'slide-in-left': 'slide-in-left 0.4s ease-out',
  			'scale-in': 'scale-in 0.3s ease-out',
  			'shimmer': 'shimmer 2s linear infinite',
  			'count-up': 'count-up 0.6s ease-out',
  			'lightning-strike': 'lightning-strike 2s infinite',
  			'chain-form': 'chain-form 2s infinite',
  			'chain-shimmer': 'chain-shimmer 3s ease-in-out infinite',
  			'electric-pulse': 'electric-pulse 1.5s ease-in-out infinite',
  			'flash': 'flash 2s infinite',
  			'link-forge-1': 'link-forge-1 2s infinite',
  			'link-forge-2': 'link-forge-2 2s infinite',
  			'impact-wave': 'impact-wave 2s infinite',
  			'ripple': 'ripple 2s infinite',
  			'sparkle': 'sparkle 2s infinite',
  			'spark-1': 'spark-1 2s infinite',
  			'spark-2': 'spark-2 2s infinite',
  			'spark-3': 'spark-3 2s infinite',
  			'blob': 'blob 15s infinite',
  			'blob-slow': 'blob-slow 25s infinite'
  		},
  		animationDelay: {
  			'75': '75ms',
  			'100': '100ms',
  			'150': '150ms',
  			'200': '200ms',
  			'300': '300ms',
  			'500': '500ms',
  			'700': '700ms',
  			'1000': '1s',
  			'2000': '2s',
  			'3000': '3s',
  			'4000': '4s',
  			'6000': '6s'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
