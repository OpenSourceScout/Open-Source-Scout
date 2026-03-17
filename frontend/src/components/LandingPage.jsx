import { useNavigate } from 'react-router-dom'
import { Rocket, ClipboardList, Search, BarChart2, MapPin, FileText, File, Sparkles, Star, ChevronRight } from 'lucide-react'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">🔭</span>
          </div>
          <span className="font-semibold text-gray-900">Open Source Scout</span>
        </div>
        <nav className="flex items-center gap-8">
          <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm">Features</a>
          <a href="#how-it-works" className="text-gray-600 hover:text-gray-900 text-sm">How it works</a>
          <a href="#ecosystem" className="text-gray-600 hover:text-gray-900 text-sm">Ecosystem</a>
        </nav>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/login')} className="text-gray-600 hover:text-gray-900 text-sm">Log In</button>
          <button 
            onClick={() => navigate('/signup')}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
          >
            Sign Up
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-primary-50 to-white px-8 py-20">
        <div className="max-w-6xl mx-auto flex items-center gap-12">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>NEW: AI-POWERED PR DRAFTS</span>
            </div>
            <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
              <span className="text-primary-500">Find</span> Issues<br />
              <span className="text-primary-500">Locate</span> Code →<br />
              Get <span className="text-primary-500">Contribution</span><br />
              Guide
            </h1>
            <p className="text-gray-600 text-lg mb-8 max-w-md">
              The ultimate tool for open source contributors to navigate complex codebases, understand local architecture, and land their next big PR.
            </p>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/dashboard')}
                className="bg-primary-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors flex items-center gap-2"
              >
                Get Started Free <Rocket className="w-4 h-4 inline" />
              </button>
              <button className="flex items-center gap-2 text-gray-700 px-6 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                Watch Demo <ChevronRight className="w-4 h-4 inline" />
              </button>
            </div>
          </div>
          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6 transform rotate-2">
              <div className="flex gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="space-y-3">
                <div className="h-3 bg-gray-100 rounded w-3/4"></div>
                <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                <div className="h-3 bg-gray-100 rounded w-2/3"></div>
                <div className="h-3 bg-primary-100 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Choose Your Path Section */}
      <section className="px-8 py-20 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose your path</h2>
          <p className="text-gray-600 mb-10">Tailored experiences for maintainers and contributors.</p>
          
          <div className="grid grid-cols-2 gap-8">
            <div 
              onClick={() => navigate('/dashboard?mode=repo')}
              className="bg-gray-50 rounded-xl p-8 cursor-pointer hover:shadow-lg transition-all border border-transparent hover:border-primary-200"
            >
              <div className="h-40 bg-primary-100 rounded-lg mb-6"></div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                I have a repository <ClipboardList className="w-5 h-5" />
              </h3>
              <p className="text-gray-600 mb-4">
                Index your codebase to provide AI-powered onboarding, auto-categorized issues, and visual contribution paths for new developers.
              </p>
              <a className="text-primary-500 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                Setup indexing <span>→</span>
              </a>
            </div>
            
            <div 
              onClick={() => navigate('/dashboard?mode=tech')}
              className="bg-gray-50 rounded-xl p-8 cursor-pointer hover:shadow-lg transition-all border border-transparent hover:border-primary-200"
            >
              <div className="h-40 bg-purple-100 rounded-lg mb-6"></div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 flex items-center gap-2">
                Find repos matching my skills <Search className="w-5 h-5" />
              </h3>
              <p className="text-gray-600 mb-4">
                Connect your GitHub profile and we'll match your tech stack with high-impact issues across thousands of vetted open source projects.
              </p>
              <a className="text-primary-500 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                Discover projects <span>→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="px-8 py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Streamline your workflow</h2>
          <p className="text-gray-600 mb-12">
            Powerful tools designed to eliminate friction between finding an issue and making your first commit.
          </p>
          
          <div className="grid grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 text-left">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart2 className="w-5 h-5 text-primary-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smart Issue Ranking</h3>
              <p className="text-gray-600 text-sm">
                AI-driven prioritization based on your specific skills, issue complexity, and potential project impact.
              </p>
            </div>
            
            <div className="bg-white rounded-xl p-6 text-left">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <MapPin className="w-5 h-5 text-primary-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Code Location</h3>
              <p className="text-gray-600 text-sm">
                Don't waste hours searching. We pinpoint the exact files and lines where changes are needed.
              </p>
            </div>
            
            <div className="bg-white rounded-xl p-6 text-left">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-5 h-5 text-primary-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">PR Draft Generation</h3>
              <p className="text-gray-600 text-sm">
                Auto-generate clear, technical PR descriptions that maintainers love, including tests and screenshots.
              </p>
            </div>
            
            <div className="bg-white rounded-xl p-6 text-left">
              <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                <File className="w-5 h-5 text-primary-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Export to PDF</h3>
              <p className="text-gray-600 text-sm">
                Save personalized contribution guides as PDFs for offline reference or team onboarding workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-6 border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-500 rounded flex items-center justify-center">
              <span className="text-white text-xs">🔭</span>
            </div>
            <span className="text-gray-600 text-sm">Open Source Scout © 2024</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-gray-500 text-sm hover:text-gray-700">Privacy</a>
            <a href="#" className="text-gray-500 text-sm hover:text-gray-700">Terms</a>
            <a href="#" className="text-gray-500 text-sm hover:text-gray-700">Status</a>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noreferrer"
              className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-800"
            >
              <Star className="w-4 h-4" /> View GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
