/**
 * Kyle's résumé, copied word for word from the Markdown he exports the PDF from. The PDF at
 * `pdf` must say the same thing; update both together.
 */
export interface RecordLogo {
	src: string;
	alt: string;
	width: number;
	height: number;
}

export interface RecordPoint {
	/** Bold lead-in before the point's text, as in "Design2Text:". */
	lead?: string;
	text: string;
}

export interface ResumeRecord {
	title: string;
	organization?: string;
	place?: string;
	note?: string;
	dates: string;
	/** An organization logo, or 'kn' for work without an organization. Omitted for text-only Records. */
	logo?: RecordLogo | 'kn';
	links?: { label: string; href: string }[];
	points: RecordPoint[];
}

export interface SkillGroup {
	label: string;
	skills: string;
}

const logos = {
	highpoint: { src: '/images/concepts/highpoint.png', alt: 'HighPoint logo', width: 256, height: 256 },
	customStacks: { src: '/images/concepts/custom-stacks.svg', alt: 'Custom Stacks logo', width: 189, height: 189 },
	geekoffice: { src: '/images/concepts/geekoffice.svg', alt: 'GeekOffice logo', width: 61, height: 45 },
	apu: { src: '/images/concepts/apu.webp', alt: 'Azusa Pacific University logo', width: 1350, height: 714 },
	georgiaTech: { src: '/images/concepts/georgia-tech.png', alt: 'Georgia Tech logo', width: 675, height: 675 }
} satisfies Record<string, RecordLogo>;

export const resume = {
	pdf: '/documents/resume.pdf',
	location: 'Orange County, California',
	profile:
		'Results-driven Software Engineer with 9+ years of experience and an M.S. in Computer Science specializing in Machine Learning. Currently building AI-powered higher education products at HighPoint, where I architect LLM-integrated features, design MCP server infrastructure, and lead AI developer enablement across the engineering team. Proven track record launching greenfield projects, delivering complex React/TypeScript applications, and bridging the gap between ML research and production software.',
	experience: [
		{
			title: 'Software Engineer',
			organization: 'HighPoint Technology Solutions, Inc.',
			place: 'Tempe, AZ (Remote)',
			dates: '03/2025 – Present',
			logo: logos.highpoint,
			points: [
				{ text: 'Develop and maintain Degree Audit Wizard, a React web application with a Kotlin/GraphQL backend used by universities to configure and preview degree requirements.' },
				{ text: 'Architected the HighPoint LLM API, a Kotlin library that runs in PeopleSoft with an abstraction supporting 7 AI providers (OpenAI, Anthropic, etc.) with functional parity across all providers.' },
				{ text: 'Designed the AI Advisor chat widget for the Degree Planner product, featuring LLM-powered conversational guidance with 20+ tool-calling capabilities (path progress summary, GPA simulation, major/minor exploration). Demoed at the March 2026 Vegas EdTech conference, generating significant client interest.' },
				{ text: 'Led AI developer enablement for all 12 developers across 5 teams: evaluated and integrated AI coding tools (Codex, Claude, Cursor), authored agent context files and prompt libraries, designed a "vibe-coding" workflow with safety guardrails for non-technical staff, and built custom MCP servers for GitLab, Redmine, and Obsidian.' }
			]
		},
		{
			title: 'Machine Learning Engineer',
			organization: 'Custom Stacks, LLC.',
			place: 'Los Angeles, CA',
			dates: '11/2024 – 02/2025',
			logo: logos.customStacks,
			points: [
				{ text: 'Engineered a real-time conversational voice AI bot (pipes-voice-ai): implemented audio interruption handling and timing, call closing/farewell flows, and TTS text chunk formatting. Integrated AWS Bedrock (including Nova models), ElevenLabs TTS, and Deepgram STT into a low-latency speech pipeline.' },
				{ text: 'Built a legal document processing pipeline (manning-law): LLM-powered PDF parsing that extracts structured JSON from legal discovery documents, with OCR fallback using Tesseract (PSM parameter tuning for accuracy), parsing accuracy evaluation, and a Streamlit UI for streaming results.' },
				{ text: 'Optimized LLM prompts across both projects, reducing API costs, correcting voice mispronunciations, and improving JSON extraction reliability. Initiated observability measures logging inter-service latencies.' }
			]
		},
		{
			title: 'Independent Full-Stack Software Developer',
			organization: 'Self-employed · Freelance',
			dates: '01/2023 – 02/2025',
			logo: 'kn',
			points: [
				{ text: 'Contracted directly with clients to build web applications, clarify requirements, and deliver responsive interfaces and API integrations.' },
				{ lead: 'Design2Text:', text: 'Built a SvelteKit application using the OpenAI API to turn Figma designs into requirements documents.' },
				{ lead: 'WHIP Cars:', text: 'Built an auto-transport load management application with SvelteKit and Supabase under a direct client contract.' },
				{ lead: 'Shiftwell:', text: 'Built a restaurant shift scheduling application with SvelteKit and Firebase.' },
				{ lead: 'Kiqo:', text: 'Developed a web application under a separate direct client contract.' }
			]
		},
		{
			title: 'Freelance Full-Stack Web Developer',
			organization: 'GeekOffice, LLC',
			place: 'Los Angeles, CA',
			note: 'Freelance engagement',
			dates: '01/2023 – 02/2025',
			logo: logos.geekoffice,
			points: [
				{ text: 'Partnered with a web designer to build the HyCite corporate website using Angular and Dato CMS.' },
				{ text: 'Collaborated with the GeekOffice team on smaller web projects, including a showcase website for the company.' }
			]
		},
		{
			title: 'Full-Stack Web Developer',
			organization: 'Azusa Pacific University',
			place: 'Azusa, CA',
			dates: '05/2017 – 06/2022',
			logo: logos.apu,
			points: [
				{ text: 'Led front-end development to launch the university web portal, enhancing functionality with PHP, CSS, and JS.' },
				{ text: 'Collaborated on backend development, integrating databases/APIs and developing secure SQL queries.' },
				{ text: 'Integrated analytics for strategic insights, managed iOS app (Swift), and reduced API costs by $180/m (90%).' },
				{ text: 'Launched a CV occupancy monitoring system and a video streaming service with attendance tracker.' },
				{ text: 'Mentored junior developers, overhauled the legacy codebase, and established a detailed wiki.' }
			]
		}
	] satisfies ResumeRecord[],
	projects: [
		{
			title: 'Open-Source Python Package for ML Engineering',
			dates: '06/2024 – 02/2025',
			links: [
				{ label: 'GitHub', href: 'https://github.com/knakamura13/mlrose-ky' },
				{ label: 'PyPi.org', href: 'https://pypi.org/project/mlrose-ky' }
			],
			points: [
				{ text: 'Forked and refactored 10,000+ lines of code in the mlrose-hiive repository for better quality and maintainability.' },
				{ text: 'Added tests using Pytest, boosting code coverage from 5% to 100%, ensuring dependable functionality.' },
				{ text: 'Improved documentation with detailed docstrings and modern type hints for better accessibility and usability.' },
				{ text: 'Fixed critical bugs and optimized performance through NumPy vectorization and algorithm optimizations.' }
			]
		},
		{
			title: 'ML Dataset Preprocessing Toolkit',
			dates: '08/2023 – 07/2024',
			links: [{ label: 'GitHub', href: 'https://github.com/knakamura13/huggingface-dataset-toolkit' }],
			points: [
				{ text: 'Created a versatile dataset toolkit, enabling seamless data preparation from various sources (e.g., Huggingface).' },
				{ text: 'Automated common data preparation tasks like encoding, scaling, normalizing, and sampling data.' },
				{ text: 'Developed an image-to-tabular conversion pipeline for image-based datasets, utilizing advanced resizing techniques to preserve aspect ratios and enhance downstream ML performance.' }
			]
		},
		{
			title: 'Funded Project: Real-Time Campus Parking Lot Occupancy System',
			organization: 'Azusa Pacific University',
			dates: '01/2018 – 08/2018',
			points: [
				{ text: 'Collaborated under the mentorship of an AI professor and funding of the IT department to develop a computer vision-based system that monitors campus parking lot occupancy in real-time.' },
				{ text: 'Created a 3D model of the campus parking lot to generate a synthetic dataset to train a CNN using TensorFlow.' },
				{ text: 'Deployed the model to the cloud, processing live video feeds to provide real-time occupancy data.' }
			]
		}
	] satisfies ResumeRecord[],
	education: [
		{
			title: 'Master of Science in Computer Science (Machine Learning)',
			organization: 'Georgia Institute of Technology',
			place: 'Atlanta, GA',
			note: 'Key Coursework: Machine Learning, Graduate Algorithms, Computer Vision, Computational Photography, AI Ethics',
			dates: '08/2021 – 05/2024',
			logo: logos.georgiaTech,
			points: []
		},
		{
			title: 'Bachelor of Science in Computer Science (Minor in Mathematics)',
			organization: 'Azusa Pacific University',
			place: 'Azusa, CA',
			dates: '08/2014 – 05/2018',
			logo: logos.apu,
			points: []
		}
	] satisfies ResumeRecord[],
	skills: [
		{ label: 'Professional', skills: 'Technical Leadership, AI Strategy & Enablement, Project Management, Agile, Mentorship' },
		{
			label: 'Software Dev.',
			skills: 'Full-Stack Development, React, Angular, SvelteKit, TypeScript/JavaScript, Kotlin, PHP, GraphQL, HTML, SCSS, TurboRepo, Storybook, Playwright E2E Testing, Rapid Prototyping, CI/CD, Docker, Git/GitLab, Linux/Unix, MySQL, RESTful APIs, Cloud Services (AWS, GCP)'
		},
		{
			label: 'ML & Technical',
			skills: 'Python, TensorFlow, PyTorch, Scikit-learn, NumPy, Pandas, LLM Integration (multi-provider tool-calling, prompt engineering), MCP Server Development, NLP/LLMs, Computer Vision'
		}
	] satisfies SkillGroup[]
};
