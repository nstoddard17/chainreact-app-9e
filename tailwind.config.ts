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
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			gray: {
  				850: '#1a202e'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
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
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
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
  			'spark-3': 'spark-3 2s infinite'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
