import { Dropdown } from "@carbon/react";

interface Props {
  resolutions: string[];
  setSelectedRes: (resolution: number) => void;
}

const excludeWords = ["Premium", "storyboard", "low", "medium", "Default"];

const ResolutionSelect: React.FC<Props> = ({ resolutions, setSelectedRes }) => {
  const resolutionsLabel = resolutions.filter((reso: string) => !excludeWords.includes(reso))
    .reverse()
    .map((reso: string) => ({ id: reso.replace(/p$/, ''), label: reso }));

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
          // @ts-ignore
          onChange={({ selectedItem }) => setSelectedRes(selectedItem.id)}
        />
      </div>
    </>
  );
};

export default ResolutionSelect;
