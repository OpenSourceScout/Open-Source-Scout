import './Header.css'
import ScoutLogo from './ScoutLogo'

export default function Header() {
  return (
    <header className="header">
      <h1 className="header__title">
        <ScoutLogo className="h-8 w-8" />
        Open Source Scout
      </h1>
      <p>AI-powered assistant for finding and contributing to open-source issues</p>
    </header>
  )
}
