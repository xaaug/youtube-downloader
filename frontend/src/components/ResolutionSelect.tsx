import { Dropdown } from "@carbon/react";

interface Format {
  format_id: string
  resolution?: string
  extension: string
  fileSize: number
}


interface  Props {
  resolutions: Format[]
  setSelectedRes: () => void
}

const ResolutionSelect: React.FC<Props> = ({resolutions, setSelectedRes}) => {

  console.log(resolutions)
  const resolutionsLabel = resolutions.map((resolution: Format) => ({
    id: resolution.resolution,
    label: `${resolution.resolution} - ${Math.round(resolution.fileSize / 1048576).toFixed(2)} MB`,
  }))
  console.log(resolutionsLabel)

  return (
    <>
      <div>
        <Dropdown
          id="default"
          invalidText="invalid selection"
          titleText=""
          items={resolutionsLabel}
          label="Select Resolution"
          type="default"
          warnText="please notice the warning"
          onChange={({selectedItem}) => setSelectedRes(selectedItem.id)}
        />
      </div>
    </>
  );
};

export default ResolutionSelect;
