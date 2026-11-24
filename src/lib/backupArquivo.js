// Backup em arquivo (.json) e o lembrete de fazer backup de tempos em tempos
import { exportarBackup, salvarConfig } from './db.js'
import { hoje } from './datas.js'

const dias = (de, ate) => {
  const [a1, m1, d1] = de.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000)
}

/**
 * Hora de lembrar do backup? Só quando já há dados que valem a pena (20+ lançamentos) e:
 * nunca fez backup, ou o último tem mais de 30 dias (60 se a conta na nuvem já guarda uma cópia).
 * "Lembrar depois" adia por 7 dias. Retorna null (não lembrar) ou { nunca, dias }.
 */
export function lembreteBackup({ ultimoBackup, adiadoAte, hoje: d, totalLancamentos, logado = false }) {
  if (totalLancamentos < 20) return null
  if (adiadoAte && d < adiadoAte) return null
  if (!ultimoBackup) return { nunca: true, dias: null }
  const passaram = dias(ultimoBackup, d)
  return passaram > (logado ? 60 : 30) ? { nunca: false, dias: passaram } : null
}

export function adiarPara(d, n = 7) {
  const [a, m, dia] = d.split('-').map(Number)
  const x = new Date(Date.UTC(a, m - 1, dia + n))
  return x.toISOString().slice(0, 10)
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Gera o arquivo e, no celular, abre o menu de compartilhar (salvar no Drive, mandar no WhatsApp...).
// Retorna false se a pessoa cancelou.
export async function fazerBackup() {
  const backup = await exportarBackup()
  const nome = `mukirana-backup-${hoje()}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const file = new File([blob], nome, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Backup do Mukirana' })
    } catch (e) {
      if (e.name === 'AbortError') return false
      baixar(blob, nome)
    }
  } else {
    baixar(blob, nome)
  }
  await salvarConfig('ultimoBackup', hoje())
  return true
}

export const adiarBackup = () => salvarConfig('backupAdiadoAte', adiarPara(hoje()))
