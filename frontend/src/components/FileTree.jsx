import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen, AlertCircle } from 'lucide-react'
import { devDebug } from '../utils/devLog'
import './FileTree.css'

/**
 * FileTree Component
 * 
 * Displays repository file structure with:
 * - Expandable/collapsible directories
 * - Yellow highlighting for files that need changes (from analysis)
 * - Orange/italicized marking for modified files
 * - Search/filter functionality
 * - File selection callback
 */

// Helper function to flatten a tree for debugging
function flattenTree(tree) {
  const items = []
  function traverse(node) {
    if (node.type === 'file') {
      items.push(node)
    } else if (node.type === 'dir' && node.children) {
      Object.values(node.children).forEach(traverse)
    }
  }
  Object.values(tree).forEach(traverse)
  return items
}

export default function FileTree({
  files = [],
  highlightedFiles = [],
  highlightedCount = 0,
  modifiedFiles = [],
  onFileSelect = () => {},
  onlyShowHighlighted = false,
}) {
  const [expandedDirs, setExpandedDirs] = useState(new Set(['']))
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)

  // Build tree structure from flat file list
  const fileTree = useMemo(() => {
    if (!files || files.length === 0) return {}

    const tree = {}

    // Filter files based on search query and highlighted preference
    // IMPORTANT: Only process ACTUAL FILES, not directory entries
    const filteredFiles = files.filter(file => {
      if (!file?.path) return false
      
      // Skip directory entries - only process files
      if (file.type === 'dir') return false
      
      const matchesSearch = searchQuery === '' || 
        file.path.toLowerCase().includes(searchQuery.toLowerCase())
      
      if (onlyShowHighlighted && searchQuery === '') {
        return highlightedFiles.includes(file.path)
      }
      
      return matchesSearch
    })

    // Build tree structure from files only
    filteredFiles.forEach(file => {
      const parts = file.path.split('/').filter(p => p.length > 0)
      if (parts.length === 0) return
      
      let current = tree

      parts.forEach((part, index) => {
        const isLastPart = index === parts.length - 1
        
        if (!current[part]) {
          if (isLastPart) {
            // It's a file
            current[part] = {
              type: 'file',
              path: file.path,
              size: file.size || 0,
              highlighted: file.highlighted === true || highlightedFiles.includes(file.path),
              modified: modifiedFiles.includes(file.path),
            }
          } else {
            // It's a directory (intermediate path component)
            current[part] = {
              type: 'dir',
              highlighted: false,
              children: {},
            }
          }
        } else if (!isLastPart && current[part].type !== 'dir') {
          // If this was previously treated as a file but we need it as a directory,
          // convert it to a directory (shouldn't happen but being safe)
          current[part] = {
            type: 'dir',
            highlighted: false,
            children: {},
          }
        }
        
        // Navigate into the directory for the next part
        if (!isLastPart && current[part].type === 'dir') {
          if (!current[part].children) {
            current[part].children = {}
          }
          current = current[part].children
        }
      })
    })

    // Mark directories as highlighted if any descendant file is highlighted.
    function computeDirHighlights(node) {
      if (!node) return false
      if (node.type === 'file') return node.highlighted === true
      if (node.type === 'dir') {
        const children = node.children || {}
        const anyChildHighlighted = Object.values(children).some(computeDirHighlights)
        node.highlighted = anyChildHighlighted
        return anyChildHighlighted
      }
      // Root map case
      return Object.values(node).some(computeDirHighlights)
    }
    computeDirHighlights(tree)

    // Debug logging (dev only)
    const highlightedInTree = flattenTree(tree).filter(item => item.highlighted).length
    devDebug('FileTree built:', {
      totalInputFiles: files.length,
      fileEntriesProcessed: filteredFiles.length,
      treeRoots: Object.keys(tree).length,
      highlightedInTree,
      sampleHighlighted: files.filter(f => f.highlighted).slice(0, 3).map(f => f.path),
    })

    return tree
  }, [files, highlightedFiles, searchQuery, onlyShowHighlighted, modifiedFiles])

  const toggleDir = (path) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  // Auto-expand directories that contain highlighted files
  useEffect(() => {
    if (highlightedFiles.length === 0) {
      setExpandedDirs(new Set(['']))
      return
    }
    
    const dirsToExpand = new Set([''])
    highlightedFiles.forEach(filePath => {
      const parts = filePath.split('/').filter(p => p.length > 0)
      let currentPath = ''
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i]
        dirsToExpand.add(currentPath)
      }
    })
    setExpandedDirs(dirsToExpand)
  }, [highlightedFiles])

  const handleFileClick = (filePath) => {
    setSelectedFile(filePath)
    onFileSelect(filePath)
  }

  const TreeNode = ({ name, item, parentPath = '' }) => {
    const fullPath = parentPath ? `${parentPath}/${name}` : name
    const isDir = item.type === 'dir'
    const isExpanded = expandedDirs.has(fullPath)

    if (isDir) {
      const childEntries = Object.entries(item.children || {})
      const childFileCount = childEntries.filter(
        ([_, child]) => child.type === 'file'
      ).length
      const dirHighlighted = item.highlighted === true

      return (
        <div key={`dir-${fullPath}`} className="file-tree-item-wrapper">
          <div
            className={`tree-item dir-item ${dirHighlighted ? 'highlighted' : ''}`}
            onClick={() => toggleDir(fullPath)}
          >
            <button className="expand-btn">
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
            {isExpanded ? (
              <FolderOpen size={16} className="file-icon" />
            ) : (
              <Folder size={16} className="file-icon" />
            )}
            <span className="dir-name">{name}</span>
            {childFileCount > 0 && (
              <span className="file-count">({childFileCount})</span>
            )}
          </div>
          {isExpanded && childEntries.length > 0 && (
            <div className="tree-children">
              {childEntries.map(([childName, childItem]) => (
                <TreeNode
                  key={`${fullPath}/${childName}`}
                  name={childName}
                  item={childItem}
                  parentPath={fullPath}
                />
              ))}
            </div>
          )}
        </div>
      )
    }

    // It's a file
    const highlighted = item.highlighted === true
    const modified = item.modified === true
    const isSelected = selectedFile === item.path

    return (
      <div
        key={`file-${item.path}`}
        className={`file-tree-item-wrapper`}
      >
        <div
          className={`tree-item file-item ${
            highlighted ? 'highlighted' : ''
          } ${modified ? 'modified' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleFileClick(item.path)}
        >
          <div className="file-icon-spacer" />
          <FileCode size={16} className="file-icon" />
          <span className={`file-name ${modified ? 'modified-name' : ''}`}>
            {name}
          </span>
          {highlighted && !modified && (
            <span className="highlight-badge">
              <AlertCircle size={12} />
            </span>
          )}
          {modified && (
            <span className="modified-badge">[MOD]</span>
          )}
        </div>
      </div>
    )
  }

  const totalCount = files.filter(f => f.type === 'file').length
  const treeEntries = Object.entries(fileTree)

  return (
    <div className="file-tree-container">
      <div className="tree-header">
        <div className="tree-stats">
          <span className="stat-line">
            {highlightedCount}/{totalCount}
          </span>
          <span className="stat-label">to review</span>
        </div>
      </div>

      <div className="tree-search">
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button
            className="clear-search"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>

      <div className="tree-content">
        {treeEntries.length === 0 ? (
          <div className="empty-state">
            <p>No files found</p>
            {searchQuery && (
              <p className="text-sm">Try a different search</p>
            )}
            {totalCount === 0 && !searchQuery && (
              <p className="text-sm">Loading file tree...</p>
            )}
          </div>
        ) : (
          treeEntries.map(([name, item]) => (
            <TreeNode key={name} name={name} item={item} />
          ))
        )}
      </div>

      <div className="tree-footer">
        <div className="legend">
          <div className="legend-item">
            <div className="legend-color highlighted" />
            <span>To Review</span>
          </div>
          <div className="legend-item">
            <div className="legend-color modified" />
            <span className="legend-italic">Modified</span>
          </div>
        </div>
      </div>
    </div>
  )
}
